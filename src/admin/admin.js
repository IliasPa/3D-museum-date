/**
 * The curator page (/admin): create a museum per couple, upload their photos
 * and videos, write their texts and message, choose their song, and decide
 * which Google accounts may enter. Each museum has its own link (…/?m=name).
 * Only the admin email(s) in firebase-config.js get past the sign-in gate —
 * and the database rules enforce the same thing.
 */
import '@fontsource/eb-garamond/500.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import './admin.css';

import { watchUser, signInWithGoogle, signOutUser, signInErrorMessage, isAdminEmail, isConfigured } from '../backend/firebase.js';
import { loadMusicUrl, imageUrl } from '../backend/museumData.js';
import { museumConfig } from '../museumConfig.js';
import * as store from './store.js';
import { processImage, isHeic, titleFromFileName } from './imageTools.js';
import { processVideo, MAX_VIDEO_MB } from './videoTools.js';
import { renderFloorPlan } from './floorPlan.js';
import { sortable } from './sortable.js';
import { planMuseum, ROOM_SIZE, MIN_ROOM, MAX_ROOM } from '../world/layout.js';

const $ = (selector, root = document) => root.querySelector(selector);
const MB = 1024 * 1024;
const MAX_SONG_BYTES = 8 * MB;
// Everything lives in Firestore, whose free (Spark) plan stores 1 GB in total.
const FREE_PLAN_BYTES = 1024 * MB;
const RESERVE_BYTES = 16 * MB; // the database's own overhead: document names, indexes…
const PHOTO_ESTIMATE = 1.25 * MB; // photos uploaded before their size was recorded

const state = {
  museums: [],
  current: null, // the museum being edited ({ id, ...data })
  photos: [], // in walking order
  videos: [],
  guests: [],
  tab: 'photos',
};
if (import.meta.env.DEV) window.__admin = state; // handy for poking around in the console (and for tests)

// ── Sign-in gate ──────────────────────────────────────────────────────
$('[data-action="signin"]').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') $('.gate-error').textContent = signInErrorMessage(err);
  }
});
$('[data-action="signout"]').addEventListener('click', () => signOutUser());

if (!isConfigured) {
  showGate('Firebase isn’t set up yet — see README → “Firebase setup”.', false);
} else {
  watchUser(async (user) => {
    $('.who').hidden = !user;
    $('.who-email').textContent = user?.email ?? '';
    if (!user) return showGate('Sign in with the curator’s Google account to manage the museums.', true);
    if (!isAdminEmail(user.email)) {
      return showGate(`${user.email} isn’t the curator’s account. Sign out and sign in with the curator’s account.`, false);
    }
    $('#gate').hidden = true;
    $('#workspace').hidden = false;
    try {
      await refreshMuseums();
      store.syncAccessMirror().catch((err) => console.warn('[admin] could not sync guest lists:', err.message));
      measureMuseums().catch((err) => console.warn('[admin] could not measure the museums:', err.message));
    } catch (err) {
      console.error(err);
      toast('Couldn’t load the museums — check the console for details.');
    }
  });
}

function showGate(text, canSignIn) {
  $('#workspace').hidden = true;
  $('#gate').hidden = false;
  $('.gate-text').textContent = text;
  $('[data-action="signin"]').hidden = !canSignIn;
}

// ── Museum list ───────────────────────────────────────────────────────
async function refreshMuseums(selectId = state.current?.id) {
  state.museums = await store.listMuseums();
  renderMuseumList();
  renderStorage();
  const next = state.museums.find((m) => m.id === selectId) ?? state.museums[0];
  if (next) await selectMuseum(next.id);
  else $('.editor').hidden = true;
}

function renderMuseumList() {
  const list = $('.museum-list');
  list.replaceChildren();
  for (const m of state.museums) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = m.id;
    b.textContent = m.name || m.title || 'Untitled';
    b.setAttribute('aria-current', String(m.id === state.current?.id));
    b.addEventListener('click', () => selectMuseum(m.id));
    li.append(b);
    list.append(li);
  }
  if (!state.museums.length) list.innerHTML = '<li class="empty">No museums yet — create the first one below.</li>';
}

$('.new-museum').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.elements.name;
  const id = await store.createMuseum(input.value.trim(), state.museums);
  input.value = '';
  toast('Museum created ♥ Now add photos and guests.');
  await refreshMuseums(id);
});

async function selectMuseum(id) {
  state.current = state.museums.find((m) => m.id === id);
  selection = null;
  for (const b of $('.museum-list').querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === id));
  $('.editor').hidden = false;
  $('.editor-title').textContent = state.current.name || state.current.title;
  if (!state.current.slug) {
    // Museums made before links existed get one now.
    state.current.slug = store.uniqueSlug(state.current.name || state.current.title || 'museum', state.museums, id);
    await store.saveMuseum(id, { slug: state.current.slug });
  }
  renderLinks();
  [state.photos, state.videos, state.guests] = await Promise.all([store.listPhotos(id), store.listVideos(id), store.listGuests(id)]);
  if (state.current?.id !== id) return;
  await settleSpots().catch((err) => console.warn('[admin] could not save the photo spots:', err.message));
  updateUsage();
  renderStats();
  renderTab();
}

/** This museum's own address (and the "Walk through" button). */
function museumLink() {
  return new URL(`../?m=${encodeURIComponent(state.current.slug)}`, location.href).href;
}

function renderLinks() {
  $('.walk-link').href = museumLink();
  $('.share-url').textContent = museumLink();
}

function renderStats() {
  const rooms = museumConfig(state.current).rooms.length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  $('.editor-stats').textContent = [
    plural(state.photos.length, 'photo'), plural(state.videos.length, 'video'), plural(rooms, 'room'), plural(state.guests.length, 'guest'),
    megabytes(state.current.usage ?? 0),
  ].join(' · ');
}

// ── Storage: 1 GB for everything, on the free plan ────────────────────
const megabytes = (bytes) => `${bytes >= 100 * MB ? Math.round(bytes / MB) : (bytes / MB).toFixed(1)} MB`;

/** Bytes a museum's photos, videos and song take up in the database. */
function usageOf(photos, videos, music) {
  return photos.reduce((n, p) => n + (p.bytes ?? PHOTO_ESTIMATE), 0)
    + videos.reduce((n, v) => n + (v.size ?? 0) + (v.poster?.toUint8Array?.().length ?? 0), 0)
    + (music?.size ?? 0);
}

const totalUsage = () => state.museums.reduce((n, m) => n + (m.usage ?? 0), 0);
const freeBytes = () => Math.max(0, FREE_PLAN_BYTES - RESERVE_BYTES - totalUsage());

/** Recount the open museum (after uploads and deletions) and remember it on the museum. */
let usageTimer;
function updateUsage() {
  const m = state.current;
  if (!m) return;
  const bytes = usageOf(state.photos, state.videos, m.music);
  if (m.usage !== bytes) {
    m.usage = bytes;
    clearTimeout(usageTimer);
    usageTimer = setTimeout(() => store.saveMuseum(m.id, { usage: bytes }).catch((err) => console.warn('[admin]', err.message)), 1500);
  }
  renderStorage();
  renderStats();
}

/** Museums that were never measured (made before the storage meter) get measured once. */
async function measureMuseums() {
  for (const m of state.museums) {
    if (m.usage != null) continue;
    const [photos, videos] = await Promise.all([store.listPhotos(m.id), store.listVideos(m.id)]);
    m.usage = usageOf(photos, videos, m.music);
    await store.saveMuseum(m.id, { usage: m.usage });
    renderStorage();
  }
}

function renderStorage() {
  const used = totalUsage() + RESERVE_BYTES;
  const share = Math.min(1, used / FREE_PLAN_BYTES);
  $('.storage-bar span').style.width = `${(share * 100).toFixed(1)}%`;
  $('.storage').classList.toggle('full', share > 0.9);
  $('.storage-text').textContent = `${megabytes(used)} of 1 GB used · ${megabytes(freeBytes())} free`;
}

// ── Tabs ──────────────────────────────────────────────────────────────
for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab;
    renderTab();
  });
}

function renderTab() {
  for (const t of document.querySelectorAll('[role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === state.tab));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== state.tab;
  ({ photos: renderPhotos, videos: renderVideos, guests: renderGuests, music: renderMusic, preview: renderPreview })[state.tab]();
}

/** Re-draw whatever shows the photos. */
function renderPhotosEverywhere() {
  if (state.tab === 'photos') renderPhotos();
  if (state.tab === 'preview') renderPreview();
  renderStats();
}

// ── Photo spots ───────────────────────────────────────────────────────
// Every room has fixed spots on its walls (layout.js); each photo keeps its
// own (`room` + `slot`), and `order` follows the walking order.

function currentPlan() {
  return planMuseum(museumConfig(state.current), state.photos, state.videos);
}

/** Give every photo a fixed spot and its walking-order number — and save what changed. */
async function settleSpots() {
  const museumId = state.current.id;
  const plan = currentPlan();
  const updates = [];
  plan.frames.forEach((f, i) => {
    const p = f.photo;
    const room = f.roomIndex + 1;
    if (p.slot !== f.slot || p.room !== room || p.order !== i + 1) {
      Object.assign(p, { slot: f.slot, room, order: i + 1 });
      updates.push({ id: p.id, slot: f.slot, room, order: i + 1 });
    }
  });
  state.photos = plan.frames.map((f) => f.photo);
  if (updates.length) await store.updatePhotos(museumId, updates);
  return plan;
}

/** Save photo moves, showing how it went in the Preview's status line. */
async function saveSpots() {
  const status = $('.layout-status');
  status.textContent = 'Saving…';
  try {
    await settleSpots();
    status.textContent = 'Saved ✓';
  } catch (err) {
    console.error(err);
    status.textContent = 'Couldn’t save — try again.';
    toast('Couldn’t save the new order — please try again.');
  }
}

/** The free spots, in walking order (optionally only in one room). */
function freeSpots(plan, room = null) {
  return plan.spots.filter((s) => !s.blocked && !s.photo && (room == null || s.roomIndex === room - 1));
}

const roomTitle = (room) => museumConfig(state.current).rooms[room - 1]?.title ?? `Room ${room}`;

/** Put a photo on another spot (swapping with the photo there), or on a room's first free spot. */
async function movePhotoToSpot(photo, { room, slot = null }) {
  const plan = currentPlan();
  if (slot == null) {
    if (photo.room === room) return;
    const free = freeSpots(plan, room)[0];
    if (!free) return toast(`“${roomTitle(room)}” has no free spot — make it bigger first.`);
    slot = free.slot;
  }
  const other = plan.spots.find((s) => s.roomIndex === room - 1 && s.slot === slot)?.photo;
  if (other && other !== photo) Object.assign(other, { room: photo.room, slot: photo.slot });
  Object.assign(photo, { room, slot });
  selection = { kind: 'spot', room, slot };
  await saveSpots();
  renderPhotosEverywhere();
}

/**
 * The Photos tab's order: `photo` now sits at `index` among the photos of
 * `room`. The room's photos share the same spots as before (plus one free
 * spot if it came from another room), in the new order.
 */
async function movePhotoInList(photo, room, index) {
  const plan = currentPlan();
  const spots = plan.spots.filter((s) => s.roomIndex === room - 1 && !s.blocked);
  const others = spots.filter((s) => s.photo && s.photo !== photo);
  const slots = others.map((s) => s.slot);
  if (photo.room === room) slots.push(photo.slot);
  else {
    const free = spots.find((s) => !s.photo);
    if (!free) {
      toast(`“${roomTitle(room)}” is full — make it bigger in Preview first.`);
      return false;
    }
    slots.push(free.slot);
  }
  slots.sort((a, b) => a - b);
  const list = others.map((s) => s.photo);
  list.splice(index, 0, photo);
  list.forEach((p, i) => Object.assign(p, { room, slot: slots[i] }));
  await saveSpots();
  refreshPhotoNumbers();
  renderStats();
  return true;
}

/** Delete a photo — with a few seconds to change your mind. */
function deletePhotoLater(photo) {
  const museumId = state.current.id;
  state.photos = state.photos.filter((p) => p !== photo);
  if (selection?.kind === 'spot' && selection.room === photo.room && selection.slot === photo.slot) selection = null;
  renderPhotosEverywhere();
  updateUsage();
  let undone = false;
  const timer = setTimeout(() => {
    if (!undone) store.deletePhoto(museumId, photo.id).catch((err) => toast(`Couldn’t delete it: ${err.message}`));
  }, 6000);
  toast(`“${photo.title || 'The photo'}” was deleted.`, 6000, {
    label: 'Undo',
    run: async () => {
      undone = true;
      clearTimeout(timer);
      if (state.current?.id !== museumId) return;
      state.photos.push(photo); // back on its spot (or the first free one, if that's taken now)
      await settleSpots();
      renderPhotosEverywhere();
      updateUsage();
    },
  });
}

// ── Photos tab ────────────────────────────────────────────────────────
function renderPhotos() {
  const plan = currentPlan();
  const wrap = $('.photo-rooms');
  wrap.replaceChildren(...museumConfig(state.current).rooms.map((room, i) => {
    const spots = plan.spots.filter((s) => s.roomIndex === i && !s.blocked);
    const section = document.createElement('section');
    section.className = 'photo-room';
    section.dataset.room = i + 1;
    const head = document.createElement('h3');
    head.innerHTML = '<span class="pr-title"></span> <small class="pr-count"></small>';
    $('.pr-title', head).textContent = room.title;
    const grid = document.createElement('div');
    grid.className = 'photo-grid';
    grid.dataset.room = i + 1;
    grid.append(...spots.filter((s) => s.photo).map((s) => photoCard(s.photo, s.number)));
    section.append(head, grid);
    // New photos dropped straight onto a room go to its free spots.
    section.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      section.classList.add('file-over');
    });
    section.addEventListener('dragleave', () => section.classList.remove('file-over'));
    section.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      section.classList.remove('file-over');
      uploadFiles([...e.dataTransfer.files], { room: i + 1 });
    });
    return section;
  }));
  refreshPhotoNumbers(plan);
}

/** Update the numbers and "3 of 12 spots" counts without rebuilding the cards. */
function refreshPhotoNumbers(plan = currentPlan()) {
  for (const section of document.querySelectorAll('.photo-room')) {
    const i = Number(section.dataset.room) - 1;
    const spots = plan.spots.filter((s) => s.roomIndex === i && !s.blocked);
    const filled = spots.filter((s) => s.photo).length;
    $('.pr-count', section).textContent = `${filled} of ${spots.length} spots`;
  }
  for (const spot of plan.spots) {
    if (!spot.photo) continue;
    const badge = document.querySelector(`.photo-card[data-id="${spot.photo.id}"] .photo-number`);
    if (badge) badge.textContent = spot.number;
  }
}

function photoCard(photo, number) {
  const museumId = state.current.id; // saves go to this museum, even if you switch meanwhile
  const card = document.createElement('article');
  card.className = 'photo-card';
  card.dataset.id = photo.id;
  card.innerHTML = `
    <div class="photo-thumb" title="Drag to move"><span class="photo-number"></span></div>
    <div class="photo-fields">
      <input name="title" placeholder="Title" maxlength="80" />
      <input name="date" placeholder="Date — any text, e.g. Summer 2021" maxlength="60" />
      <textarea name="caption" rows="2" placeholder="Caption" maxlength="400"></textarea>
      <span class="saved"></span>
    </div>`;
  $('.photo-number', card).textContent = number;
  const img = new Image();
  img.alt = '';
  img.draggable = false;
  img.src = URL.createObjectURL(new Blob([photo.thumb.toUint8Array()], { type: 'image/jpeg' }));
  $('.photo-thumb', card).prepend(img);
  for (const name of ['title', 'date', 'caption']) card.querySelector(`[name="${name}"]`).value = photo[name] ?? '';
  card.addEventListener('input', autosavePhoto(museumId, photo, card, $('.saved', card)));
  return card;
}

/** Saves a photo's texts a moment after typing stops. */
function autosavePhoto(museumId, photo, fields, saved) {
  let timer;
  return () => {
    clearTimeout(timer);
    saved.textContent = '…';
    timer = setTimeout(async () => {
      const patch = Object.fromEntries(['title', 'date', 'caption'].map((n) => [n, fields.querySelector(`[name="${n}"]`).value.trim()]));
      try {
        await store.updatePhoto(museumId, photo.id, patch);
        Object.assign(photo, patch);
        saved.textContent = 'Saved ✓';
      } catch (err) {
        saved.textContent = 'Not saved!';
        console.error(err);
      }
    }, 600);
  };
}

// Drag & drop: reorder, move to another room, or into the bin.
sortable($('[data-panel="photos"]'), {
  item: '.photo-card',
  handle: '.photo-thumb',
  list: '.photo-grid',
  zone: '.photo-room',
  targets: ['.bin'],
  onDrop: ({ item, list, index, target }) => {
    const photo = state.photos.find((p) => p.id === item.dataset.id);
    if (!photo) return false;
    if (target) {
      setTimeout(() => deletePhotoLater(photo), 280); // after the card has shrunk into the bin
      return true;
    }
    return movePhotoInList(photo, Number(list.dataset.room), index);
  },
});

const dropzone = $('[data-panel="photos"] .dropzone');
$('.file-input').addEventListener('change', (e) => {
  uploadFiles([...e.target.files]);
  e.target.value = '';
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  uploadFiles([...e.dataTransfer.files]);
});

/**
 * Resize each photo in the browser, then save it on a spot: the given one
 * (`room` + `slot`), else the first free spot (in `room`, or anywhere).
 * `details[i]` can preset the texts (and room) of each photo.
 */
async function uploadFiles(files, { room = null, slot = null, details = [] } = {}) {
  const museumId = state.current.id;
  const items = files.map((file, i) => ({ file, extra: details[i] ?? {} }))
    .filter(({ file }) => file.type.startsWith('image/') || isHeic(file));
  if (!items.length) return;
  const status = state.tab === 'preview' ? $('.layout-status') : $('.upload-status');
  const failed = [];
  let grew = null;
  for (const [i, { file, extra }] of items.entries()) {
    if (freeBytes() < 2 * MB) {
      failed.push(`${file.name} (the storage is full)`);
      continue;
    }
    status.textContent = `Preparing ${i + 1} of ${items.length}: ${file.name}…`;
    try {
      // Where it goes: this spot, else the first free one.
      const wantedRoom = room ?? extra.room ?? null;
      const free = freeSpots(currentPlan(), wantedRoom)[0];
      const target = i === 0 && slot != null ? { room, slot }
        : free ? { room: free.roomIndex + 1, slot: free.slot }
          : { room: wantedRoom ?? museumConfig(state.current).rooms.length, slot: null }; // no free spot: that room grows
      if (target.slot == null) grew = target.room;
      const processed = await processImage(file);
      const photo = await store.uploadPhoto(museumId, processed, {
        room: target.room,
        slot: target.slot,
        order: state.photos.length + 1,
        title: extra.title ?? titleFromFileName(file.name),
        date: extra.date ?? '',
        caption: extra.caption ?? '',
      });
      if (state.current?.id !== museumId) continue; // switched museum meanwhile
      state.photos.push(photo);
      await settleSpots();
      renderPhotosEverywhere();
      updateUsage();
    } catch (err) {
      console.error(err);
      failed.push(`${file.name} (${err.message})`);
    }
  }
  status.textContent = failed.length
    ? `Done, but these didn’t work: ${failed.join(', ')}`
    : `Added ${items.length} photo${items.length === 1 ? '' : 's'} ♥`;
  if (grew) toast(`Every spot was taken, so “${roomTitle(grew)}” grew longer.`, 5000);
}

$('.add-samples').addEventListener('click', async () => {
  const base = new URL('../samples/', location.href);
  const list = await (await fetch(new URL('samples.json', base))).json();
  const files = await Promise.all(list.map(async (s) => {
    const blob = await (await fetch(new URL(s.file, base))).blob();
    return new File([blob], s.file, { type: 'image/jpeg' });
  }));
  await uploadFiles(files, { details: list.map(({ room, title, date, caption }) => ({ room, title, date, caption })) });
});

// ── Guests ────────────────────────────────────────────────────────────
function renderGuests() {
  const list = $('.guest-list');
  list.replaceChildren(...state.guests.map((email) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = email;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await store.removeGuest(state.current.id, email);
      state.guests = state.guests.filter((g) => g !== email);
      renderGuests();
      renderStats();
    });
    li.append(span, remove);
    return li;
  }));
  $('.guests-empty').hidden = state.guests.length > 0;
}

$('.guest-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.elements.email;
  const email = store.normalizeEmail(input.value);
  if (!store.isValidEmail(email)) return toast('That doesn’t look like an email address.');
  // Already invited? Just let the curator know (here: nothing to do; elsewhere: add, with a note).
  const invitedTo = await store.museumsOfGuest(email);
  if (state.guests.includes(email) || invitedTo.includes(state.current.id)) {
    return toast(`${email} is already on this museum’s guest list.`, 5000);
  }
  await store.addGuest(state.current.id, email);
  state.guests = [...state.guests, email].sort();
  input.value = '';
  renderGuests();
  renderStats();
  const elsewhere = invitedTo.map((id) => state.museums.find((m) => m.id === id)?.name).filter(Boolean);
  toast(elsewhere.length
    ? `${email} can now enter ♥ (note: this email was already invited to ${elsewhere.map((n) => `“${n}”`).join(', ')})`
    : `${email} can now enter ♥`, elsewhere.length ? 7000 : 3500);
});

$('.copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('.share-url').textContent);
    toast('Link copied');
  } catch {
    toast('Copy it by hand: ' + $('.share-url').textContent);
  }
});

// ── Videos ────────────────────────────────────────────────────────────
function roomOptions(select, selected) {
  select.replaceChildren();
  museumConfig(state.current).rooms.forEach((r, i) => {
    const o = new Option(`${i + 1}. ${r.title}`, String(i + 1));
    o.selected = Number(selected) === i + 1;
    select.append(o);
  });
}

function renderVideos() {
  const select = $('.video-room');
  roomOptions(select, select.value || state.videos.at(-1)?.room || 1);
  $('.videos-empty').hidden = state.videos.length > 0;
  $('.video-grid').replaceChildren(...state.videos.map((video, i) => videoCard(video, i)));
}

function videoCard(video, index) {
  const museumId = state.current.id; // saves go to this museum, even if you switch meanwhile
  const card = document.createElement('article');
  card.className = 'photo-card video-card';
  card.dataset.id = video.id;
  const minutes = `${Math.floor(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')}`;
  card.innerHTML = `
    <div class="photo-thumb"><span class="photo-number">▶ ${index + 1}</span></div>
    <div class="photo-fields">
      <input name="title" placeholder="Title" maxlength="80" />
      <textarea name="caption" rows="2" placeholder="Caption (optional)" maxlength="300"></textarea>
      <div class="photo-row">
        <select name="room" aria-label="Room"></select>
        <span class="saved">${minutes} · ${megabytes(video.size)}</span>
        <button type="button" class="icon danger" data-delete aria-label="Delete video">🗑</button>
      </div>
    </div>`;
  const img = new Image();
  img.alt = '';
  img.src = URL.createObjectURL(new Blob([video.poster.toUint8Array()], { type: 'image/jpeg' }));
  $('.photo-thumb', card).prepend(img);
  card.querySelector('[name="title"]').value = video.title ?? '';
  card.querySelector('[name="caption"]').value = video.caption ?? '';
  roomOptions(card.querySelector('[name="room"]'), video.room);
  let timer;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const patch = {
        title: card.querySelector('[name="title"]').value.trim(),
        caption: card.querySelector('[name="caption"]').value.trim(),
        room: Number(card.querySelector('[name="room"]').value),
      };
      await store.updateVideo(museumId, video.id, patch);
      Object.assign(video, patch);
      if (state.current?.id === museumId) await settleSpots(); // a screen may cover other spots now
      toast('Video saved ✓', 1500);
    }, 600);
  };
  card.addEventListener('input', save);
  card.addEventListener('change', save);
  $('[data-delete]', card).addEventListener('click', async () => {
    if (!confirm(`Delete the video “${video.title || 'untitled'}”?`)) return;
    await store.deleteVideo(museumId, video);
    state.videos = state.videos.filter((v) => v !== video);
    renderVideos();
    updateUsage();
  });
  return card;
}

$('.video-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const museumId = state.current.id;
  const status = $('.video-status');
  const room = Number($('.video-room').value) || 1;
  const space = Math.min(MAX_VIDEO_MB * MB, freeBytes());
  if (space < 5 * MB) {
    status.textContent = `There’s no room left for a video: ${megabytes(freeBytes())} free.`;
    return;
  }
  try {
    status.textContent = 'Converting… 0%';
    const processed = await processVideo(file, {
      maxBytes: space,
      onProgress: (p) => (status.textContent = `Converting… ${Math.round(p * 100)}%`),
    });
    const video = await store.uploadVideo(museumId, processed, {
      order: Math.max(0, ...state.videos.map((v) => v.order ?? 0)) + 1,
      room,
      title: titleFromFileName(file.name),
      caption: '',
    }, (n, total) => (status.textContent = `Uploading… ${Math.round((n / total) * 100)}%`));
    if (state.current?.id === museumId) {
      state.videos.push(video);
      await settleSpots(); // its screen covers a spot or two: photos there move to free spots
      renderVideos();
      updateUsage();
    }
    status.textContent = `Video added ♥ (${megabytes(processed.bytes.length)}) — give it a title below.`;
  } catch (err) {
    console.error(err);
    status.textContent = `That video didn’t work: ${err.message}`;
  }
});

// ── Music ─────────────────────────────────────────────────────────────
async function renderMusic() {
  const music = state.current.music;
  $('.music-current').textContent = music
    ? `Playing: ${music.name} (${megabytes(music.size)})`
    : 'Playing: the default music-box tune.';
  $('.remove-music').hidden = !music;
  const player = $('.music-player');
  player.src = (await loadMusicUrl(state.current.id, music).catch(() => null)) ?? new URL('../audio/song.mp3', location.href).href;
}

$('.music-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_SONG_BYTES) return toast('That song is over 8 MB — please use a smaller MP3 (128 kbps is plenty).');
  const status = $('.music-status');
  try {
    state.current.music = await store.uploadMusic(state.current.id, file, (n, total) => {
      status.textContent = `Uploading… ${Math.round((n / total) * 100)}%`;
    });
    status.textContent = 'Song saved ♥';
    renderMusic();
    updateUsage();
  } catch (err) {
    console.error(err);
    status.textContent = 'Upload failed — please try again.';
  }
});

$('.remove-music').addEventListener('click', async () => {
  await store.removeMusic(state.current.id, state.current.music);
  state.current.music = null;
  renderMusic();
  updateUsage();
});

// ── Preview & layout editor ───────────────────────────────────────────
/** What's selected on the floor plan: { kind: 'room', index } | { kind: 'spot', room, slot } | { kind: 'start' } | { kind: 'finale' } | null. */
let selection = null;
const selectedRoom = () => (selection?.kind === 'room' ? selection.index : -1);

/** The museum's rooms (a copy, ready to edit). */
function rooms() {
  return museumConfig(state.current).rooms.map((r) => ({ ...r }));
}

function renderPreview() {
  const { svg, plan } = renderFloorPlan(museumConfig(state.current), state.photos, state.videos, {
    selected: selection,
    onSelect: (next) => {
      if (next.kind === 'video') return showVideoCard(next.video);
      const same = selection && JSON.stringify(selection) === JSON.stringify(next);
      selection = same ? null : next;
      renderPreview();
      if (selection) document.querySelector('[data-panel="preview"] .panel:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    onDrop: (photo, to) => movePhotoToSpot(photo, to),
    onVideoDrop: (video, room) => moveVideo(video, room),
  });
  $('.plan-wrap').replaceChildren(svg);
  renderRoomPanel(plan);
  renderSpotPanel(plan);
  renderStartPanel();
  renderFinalePanel();
}

function showVideoCard(video) {
  state.tab = 'videos';
  renderTab();
  const card = document.querySelector(`.video-card[data-id="${video.id}"]`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card?.classList.add('flash');
  setTimeout(() => card?.classList.remove('flash'), 1600);
}

/** Fill a field unless the curator is typing in it right now. */
function setField(field, value, kind) {
  const panel = field.closest('.panel');
  if (document.activeElement === field && panel.dataset.for === kind) return;
  if (field.type === 'checkbox') field.checked = Boolean(value);
  else field.value = value ?? '';
}

/** The panel under the plan for the selected room. */
function renderRoomPanel(plan) {
  const panel = $('.room-panel');
  const list = rooms();
  const i = selectedRoom();
  const room = list[i];
  panel.hidden = !room;
  if (!room) return;
  const actual = plan.rooms[i];
  const key = `room-${i}`;
  setField($('.rp-name'), room.title, key);
  setField($('.rp-wall'), room.wall, key);
  setField($('.rp-trim'), room.trim, key);
  panel.dataset.for = key;
  $('.rp-width').textContent = `${Math.round(actual.width)} m`;
  $('.rp-depth').textContent = `${Math.round(actual.depth)} m`;
  const grown = actual.width > (room.width ?? ROOM_SIZE) + 0.1 || actual.depth > (room.depth ?? ROOM_SIZE) + 0.1;
  const spots = plan.spots.filter((s) => s.roomIndex === i && !s.blocked);
  $('.rp-note').textContent = `${spots.filter((s) => s.photo).length} of ${spots.length} spots filled${grown ? ' · grown to fit its photos' : ''}`;
  panel.querySelector('[data-room-move="-1"]').disabled = i === 0;
  panel.querySelector('[data-room-move="1"]').disabled = i === list.length - 1;
  panel.querySelector('[data-room-remove]').disabled = list.length === 1;
}

/** The panel for the selected spot: its photo and texts, or a way to add one. */
let spotPhoto = null;
function renderSpotPanel(plan) {
  const panel = $('.spot-panel');
  const spot = selection?.kind === 'spot' && plan.spots.find((s) => s.roomIndex === selection.room - 1 && s.slot === selection.slot && !s.blocked);
  panel.hidden = !spot;
  if (!spot) return;
  const photo = spot.photo;
  $('.spot-filled', panel).hidden = !photo;
  $('.spot-empty', panel).hidden = Boolean(photo);
  if (!photo) {
    $('.sp-empty-title', panel).textContent = `Add a photo to spot ${spot.number}`;
    spotPhoto = null;
    return;
  }
  const key = `photo-${photo.id}`;
  if (spotPhoto !== photo) {
    spotPhoto = photo;
    const img = $('.sp-photo', panel);
    img.src = URL.createObjectURL(new Blob([photo.thumb.toUint8Array()], { type: 'image/jpeg' })); // the small one first…
    imageUrl(state.current.id, photo.id, 'md').then((url) => spotPhoto === photo && (img.src = url)).catch(() => {}); // …then the sharp one
    $('.saved', panel).textContent = '';
  }
  $('.sp-where', panel).textContent = `Spot ${spot.number} · ${roomTitle(spot.roomIndex + 1)}`;
  for (const name of ['title', 'date', 'caption']) setField(panel.querySelector(`[name="${name}"]`), photo[name], key);
  panel.dataset.for = key;
}

let spotSaver = null;
$('.spot-filled').addEventListener('input', () => {
  if (!spotPhoto) return;
  if (spotSaver?.photo !== spotPhoto) spotSaver = { photo: spotPhoto, save: autosavePhoto(state.current.id, spotPhoto, $('.spot-filled'), $('.spot-panel .saved')) };
  spotSaver.save();
});
$('.sp-delete').addEventListener('click', () => spotPhoto && deletePhotoLater(spotPhoto));
const spotDrop = $('.spot-empty');
const uploadToSpot = (files) => selection?.kind === 'spot' && uploadFiles(files, { room: selection.room, slot: selection.slot });
$('.spot-input').addEventListener('change', (e) => {
  uploadToSpot([...e.target.files]);
  e.target.value = '';
});
spotDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  spotDrop.classList.add('over');
});
spotDrop.addEventListener('dragleave', () => spotDrop.classList.remove('over'));
spotDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  spotDrop.classList.remove('over');
  uploadToSpot([...e.dataTransfer.files]);
});

// ── Start screen and hidden room (formerly the "Texts" tab) ───────────
function renderStartPanel() {
  const panel = $('.start-panel');
  panel.hidden = selection?.kind !== 'start';
  if (panel.hidden) return;
  const c = museumConfig(state.current);
  const f = panel.elements;
  for (const [field, value] of [['name', state.current.name], ['slug', state.current.slug], ['title', c.title], ['subtitle', c.subtitle], ['language', c.language]]) {
    setField(f[field], value, 'start');
  }
  panel.dataset.for = 'start';
}

function renderFinalePanel() {
  const panel = $('.finale-panel');
  panel.hidden = selection?.kind !== 'finale';
  if (panel.hidden) return;
  const { finale } = museumConfig(state.current);
  const f = panel.elements;
  for (const [field, value] of [['finaleEnabled', finale.enabled], ['doorSign', finale.doorSign], ['finaleTitle', finale.title], ['message', finale.message], ['signature', finale.signature]]) {
    setField(f[field], value, 'finale');
  }
  panel.dataset.for = 'finale';
}

/** Save a panel's texts a moment after typing stops (a ticked box: at once). */
function autosaveForm(form, patchFrom, delay = 700) {
  let timer;
  const run = async (museum) => {
    const patch = patchFrom(form.elements, museum);
    const status = $('.layout-status');
    status.textContent = 'Saving…';
    try {
      await store.saveMuseum(museum.id, patch);
      Object.assign(museum, patch); // state.current is also the entry in state.museums
      status.textContent = 'Saved ✓';
    } catch (err) {
      console.error(err);
      status.textContent = 'Couldn’t save — try again.';
    }
    if (museum !== state.current) return;
    renderLinks();
    renderMuseumList();
    $('.editor-title').textContent = museum.name || museum.title;
    if (state.tab === 'preview') renderPreview();
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => {
    const museum = state.current;
    clearTimeout(timer);
    timer = setTimeout(() => run(museum), e.target.type === 'checkbox' ? 0 : delay);
  });
}

autosaveForm($('.start-panel'), (f, museum) => {
  const wantedSlug = store.slugify(f.slug.value || f.name.value || museum.name);
  const slug = store.uniqueSlug(wantedSlug, state.museums, museum.id);
  if (slug !== wantedSlug) toast(`“${wantedSlug}” is already another museum’s link, so this one is “${slug}”.`, 6000);
  return {
    slug,
    name: f.name.value.trim() || museum.name,
    title: f.title.value.trim(),
    subtitle: f.subtitle.value.trim(),
    language: f.language.value,
  };
}, 900);

autosaveForm($('.finale-panel'), (f) => ({
  finale: {
    enabled: f.finaleEnabled.checked,
    doorSign: f.doorSign.value.trim(),
    title: f.finaleTitle.value.trim(),
    message: f.message.value,
    signature: f.signature.value.trim(),
  },
}));

$('.delete-museum').addEventListener('click', async () => {
  const name = state.current.name || state.current.title;
  if (!confirm(`Delete “${name}” with all its photos, music and guest list? This can’t be undone.`)) return;
  toast('Deleting…');
  await store.deleteMuseum(state.current.id);
  state.current = null;
  toast(`“${name}” was deleted.`);
  await refreshMuseums();
});

// ── Rooms ─────────────────────────────────────────────────────────────
/**
 * Change the rooms list (and, if rooms moved, the photos/videos that live in
 * them). The page updates at once, so quick clicks build on each other; the
 * database follows.
 */
let savesInFlight = 0;
async function saveLayout(nextRooms, renumber = null) {
  const museumId = state.current.id;
  state.current.rooms = nextRooms;
  let videoUpdates = [];
  if (renumber) {
    // renumber(oldRoomNumber) → new room number, for every photo and video.
    videoUpdates = state.videos.filter((v) => renumber(v.room) !== v.room).map((v) => ({ id: v.id, room: renumber(v.room) }));
    for (const v of state.videos) v.room = renumber(v.room);
    for (const p of state.photos) p.room = renumber(p.room); // they keep their spots (or take free ones)
  }
  renderStats();
  renderPreview();
  const status = $('.layout-status');
  status.textContent = 'Saving…';
  savesInFlight++;
  try {
    await store.updateVideos(museumId, videoUpdates);
    await store.saveMuseum(museumId, { rooms: nextRooms });
    if (state.current?.id === museumId) await settleSpots(); // a resized room has other spots
    if (--savesInFlight === 0) status.textContent = 'Saved ✓';
  } catch (err) {
    savesInFlight--;
    console.error(err);
    status.textContent = 'Couldn’t save — try again.';
  }
  if (state.current?.id === museumId && state.tab === 'preview') renderPreview();
}

// Name and colours: shown at once, saved a moment after typing stops.
let roomTimer;
for (const [sel, field] of [['.rp-name', 'title'], ['.rp-wall', 'wall'], ['.rp-trim', 'trim']]) {
  $(sel).addEventListener('input', (e) => {
    const i = selectedRoom();
    const next = rooms();
    if (!next[i]) return;
    next[i][field] = field === 'title' ? e.target.value.trim() || `Room ${i + 1}` : e.target.value;
    const museum = state.current;
    museum.rooms = next;
    renderPreview();
    clearTimeout(roomTimer);
    roomTimer = setTimeout(() => (museum === state.current ? saveLayout(rooms()) : store.saveMuseum(museum.id, { rooms: museum.rooms })), 500);
  });
}

$('.room-panel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const i = selectedRoom();
  if (!b || i < 0) return;
  const next = rooms();
  const n = next.length;
  if (b.dataset.size) {
    const key = b.dataset.size;
    const current = next[i][key] ?? ROOM_SIZE;
    next[i][key] = Math.min(MAX_ROOM, Math.max(MIN_ROOM, current + Number(b.dataset.step)));
    saveLayout(next);
  } else if (b.dataset.roomMove) {
    const j = i + Number(b.dataset.roomMove);
    if (j < 0 || j >= n) return;
    [next[i], next[j]] = [next[j], next[i]];
    selection = { kind: 'room', index: j };
    // Photos follow their room: numbers i+1 and j+1 swap.
    saveLayout(next, (r) => (r === i + 1 ? j + 1 : r === j + 1 ? i + 1 : r));
  } else if (b.hasAttribute('data-room-remove')) {
    const count = [...state.photos, ...state.videos].filter((it) => it.room === i + 1).length;
    const neighbour = next[i === 0 ? 1 : i - 1]; // its photos move to the previous room (or the next one)
    if (count && !confirm(`Remove “${next[i].title}”? Its ${count} photo(s)/video(s) move to “${neighbour.title}”.`)) return;
    next.splice(i, 1);
    selection = null;
    // Rooms after it move one place earlier; its own items join the neighbour.
    saveLayout(next, (r) => (r === i + 1 ? (i === 0 ? 1 : i) : r > i + 1 ? r - 1 : r));
  }
});

$('.add-room').addEventListener('click', () => {
  const next = rooms();
  next.push({ title: `Room ${next.length + 1}`, wall: '#ece3d6', trim: '#6b4a35' });
  selection = { kind: 'room', index: next.length - 1 };
  saveLayout(next);
});

async function moveVideo(video, room) {
  if (video.room === room) return;
  video.room = room;
  const status = $('.layout-status');
  status.textContent = 'Saving…';
  renderPreview();
  try {
    await store.updateVideo(state.current.id, video.id, { room });
    await settleSpots(); // its screen covers other spots now
    status.textContent = 'Saved ✓';
  } catch (err) {
    console.error(err);
    status.textContent = 'Couldn’t save — try again.';
  }
  renderPreview();
}

// ── Little helpers ────────────────────────────────────────────────────
/** A message at the bottom of the page, optionally with a button (e.g. Undo). */
function toast(text, ms = 3500, action = null) {
  const t = $('.toast');
  t.replaceChildren(document.createTextNode(text));
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      t.classList.remove('show');
      action.run();
    });
    t.append(b);
  }
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}
