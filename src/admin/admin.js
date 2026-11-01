/**
 * The curator page (/admin): create a museum per couple, hang their photos
 * and videos (all on the Preview's floor plan), write their texts and
 * message, choose their song, set up the proposal, the memory map and the
 * key hunt, and decide which Google accounts may enter. Each museum has its
 * own link (…/?m=name). Only the admin email(s) in firebase-config.js get
 * past the sign-in gate — and the database rules enforce the same thing.
 */
import '@fontsource/eb-garamond/500.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import './admin.css';

import { watchUser, signInWithGoogle, signOutUser, signInErrorMessage, isAdminEmail, isConfigured } from '../backend/firebase.js';
import { loadMusicUrl, imageUrl, videoUrl } from '../backend/museumData.js';
import { museumConfig, guestSettings } from '../museumConfig.js';
import { DECORATIONS, resolveDecoration } from '../seasons.js';
import { shapeOf, hiddenKeys } from '../hunt.js';
import * as store from './store.js';
import { processImage, isHeic, titleFromFileName } from './imageTools.js';
import { processVideo, MAX_VIDEO_MB } from './videoTools.js';
import { renderFloorPlan } from './floorPlan.js';
import { openZoom } from './zoom.js';
import { createHuntTab, paintKeys } from './huntTab.js';
import { createMapTab } from './mapTab.js';
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
  visits: new Map(), // email → { at, tz, yes, dodges } (written by the guests)
  mirror: [], // the mirror's pictures
  tab: 'preview',
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
  toast('Museum created ♥ Now add photos (Preview) and guests.');
  await refreshMuseums(id);
});

async function selectMuseum(id) {
  state.current = state.museums.find((m) => m.id === id);
  selection = null;
  for (const b of $('.museum-list').querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === id));
  $('.editor').hidden = false;
  $('.editor-title').textContent = state.current.name || state.current.title;
  checkRules(id);
  if (!state.current.slug) {
    // Museums made before links existed get one now.
    state.current.slug = store.uniqueSlug(state.current.name || state.current.title || 'museum', state.museums, id);
    await store.saveMuseum(id, { slug: state.current.slug });
  }
  renderLinks();
  const [photos, videos, guests, visits, mirror] = await Promise.all([
    store.listPhotos(id), store.listVideos(id), store.listGuests(id),
    store.listVisits(id).catch(() => new Map()), store.listMirrorImages(id).catch(() => []),
  ]);
  if (state.current?.id !== id) return;
  Object.assign(state, { photos, videos, guests, visits, mirror });
  await settleSpots().catch((err) => console.warn('[admin] could not save the photo spots:', err.message));
  updateUsage();
  renderStats();
  renderTab();
}

/** Older database rules on Google's servers quietly break the key hunt and the visit records: say so. */
let rulesOk = null;
function checkRules(museumId) {
  if (rulesOk != null) return; // (once it's known; offline → try again with the next museum)
  store.rulesAreCurrent(museumId).then((ok) => {
    rulesOk = ok;
    $('.rules-warning').hidden = ok !== false;
  });
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

/** Bytes a museum's photos, videos, mirror pictures and song take up in the database. */
function usageOf(photos, videos, music, mirror = []) {
  return photos.reduce((n, p) => n + (p.bytes ?? PHOTO_ESTIMATE), 0)
    + videos.reduce((n, v) => n + (v.size ?? 0) + (v.poster?.toUint8Array?.().length ?? 0), 0)
    + mirror.reduce((n, m) => n + (m.bytes ?? 0), 0)
    + (music?.size ?? 0);
}

const totalUsage = () => state.museums.reduce((n, m) => n + (m.usage ?? 0), 0);
const freeBytes = () => Math.max(0, FREE_PLAN_BYTES - RESERVE_BYTES - totalUsage());

/** Recount the open museum (after uploads and deletions) and remember it on the museum. */
let usageTimer;
function updateUsage() {
  const m = state.current;
  if (!m) return;
  const bytes = usageOf(state.photos, state.videos, m.music, state.mirror);
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
  ({ guests: renderGuests, music: renderMusic, proposal: renderProposal, map: () => mapTab.render(), hunt: () => huntTab.render(), preview: renderPreview })[state.tab]();
}

/** Re-draw whatever shows the photos. */
function renderPhotosEverywhere() {
  if (state.tab === 'preview') renderPreview();
  if (state.tab === 'hunt') huntTab.render();
  if (state.tab === 'map') mapTab.render();
  renderStats();
}

/** Small picture of a photo (or mirror picture), as an object URL (made once). */
const thumbUrls = new WeakMap();
function thumbUrl(item, bytes = item.thumb) {
  if (!thumbUrls.has(item)) thumbUrls.set(item, URL.createObjectURL(new Blob([bytes.toUint8Array()], { type: 'image/jpeg' })));
  return thumbUrls.get(item);
}
const posterUrl = (video) => thumbUrl(video, video.poster);

const status = (text) => ($('.layout-status').textContent = text);

// ── Photo spots ───────────────────────────────────────────────────────
// Every room has fixed spots on its walls (layout.js); each photo keeps its
// own (`room` + `slot`), and `order` follows the walking order. The mirror
// takes a spot too (its place is saved on the museum), and a video either
// takes a spot (`slot`) or keeps a bench (`bench`).

function currentPlan() {
  return planMuseum(museumConfig(state.current), state.photos, state.videos);
}

const MIRROR = { isMirror: true }; // stands for the mirror when it moves
/** Wall items and videos moved on this page but not saved yet (their new place is in memory already). */
let moved = new Set();

/** Give every photo, video and the mirror a fixed place and the photos their walking-order number — and save what changed. */
async function settleSpots() {
  const museum = state.current;
  const museumId = museum.id;
  const plan = currentPlan();
  const dirty = moved;
  moved = new Set();
  const updates = [];
  const videoUpdates = [];
  let mirrorMoved = null;
  let order = 0;
  for (const f of plan.frames) {
    const p = f.photo;
    const room = f.roomIndex + 1;
    if (p.isMirror) {
      const m = museumConfig(museum).mirror;
      if (m.room !== room || m.slot !== f.slot || dirty.has(MIRROR)) mirrorMoved = museum.mirror = { ...m, room, slot: f.slot };
      continue;
    }
    if (p.isVideo) {
      const v = p.video;
      if (v.slot !== f.slot || v.room !== room || v.bench != null || dirty.has(v)) {
        Object.assign(v, { slot: f.slot, room, bench: null });
        videoUpdates.push({ id: v.id, slot: f.slot, room, bench: null });
      }
      continue;
    }
    order++;
    if (p.slot !== f.slot || p.room !== room || p.order !== order || dirty.has(p)) {
      Object.assign(p, { slot: f.slot, room, order });
      updates.push({ id: p.id, slot: f.slot, room, order });
    }
  }
  for (const b of plan.benches) {
    const v = b.video;
    if (v && (v.bench !== b.index || v.room !== b.roomIndex + 1 || v.slot != null || dirty.has(v))) {
      Object.assign(v, { bench: b.index, room: b.roomIndex + 1, slot: null });
      videoUpdates.push({ id: v.id, bench: b.index, room: v.room, slot: null });
    }
  }
  state.photos = plan.frames.filter((f) => !f.photo.isMirror && !f.photo.isVideo).map((f) => f.photo);
  await Promise.all([
    store.updatePhotos(museumId, updates),
    store.updateVideos(museumId, videoUpdates),
    mirrorMoved && store.saveMuseum(museumId, { mirror: mirrorMoved }),
  ]);
  return plan;
}

/** Save moves, showing how it went in the Preview's status line. */
async function saveSpots() {
  status('Saving…');
  try {
    await settleSpots();
    status('Saved ✓');
  } catch (err) {
    console.error(err);
    status('Couldn’t save — try again.');
    toast('Couldn’t save the new order — please try again.');
  }
}

/** The free spots, in walking order (optionally only in one room). */
function freeSpots(plan, room = null) {
  return plan.spots.filter((s) => !s.blocked && !s.photo && (room == null || s.roomIndex === room - 1));
}

const roomTitle = (room) => museumConfig(state.current).rooms[room - 1]?.title ?? `Room ${room}`;

/** The photo, video or MIRROR behind something the plan shows (a wall item, or a video on a bench). */
function realItem(thing) {
  if (thing.isMirror) return MIRROR;
  if (thing.isVideo) return thing.video;
  return state.photos.find((p) => p.id === thing.id) ?? state.videos.find((v) => v.id === thing.id) ?? thing;
}

const isVideoItem = (item) => state.videos.includes(item);

/** Where something is right now: { room, slot } on a wall spot, or { room, bench } (a video on a bench). */
function placeOf(item, plan = currentPlan()) {
  const s = plan.spots.find((sp) => sp.photo && realItem(sp.photo) === item);
  if (s) return { room: s.roomIndex + 1, slot: s.slot };
  const b = isVideoItem(item) && plan.benches.find((bn) => bn.video === item);
  if (b) return { room: b.roomIndex + 1, bench: b.index };
  return { room: item.room, slot: item.slot ?? null };
}

/** Put something somewhere (in memory; settleSpots saves it). `slot` and `bench` null: the room's first free one. */
function putAt(item, { room, slot = null, bench = null }) {
  moved.add(item);
  if (item === MIRROR) state.current.mirror = { ...museumConfig(state.current).mirror, enabled: true, room, slot };
  else if (isVideoItem(item)) Object.assign(item, { room, slot, bench });
  else Object.assign(item, { room, slot });
}

/**
 * Move a photo, the mirror or a video: onto a spot (`slot` — what hangs there
 * swaps places with it), onto a bench (`bench`, videos only — a video there
 * swaps), or into a room (only `room`: its first free spot, or for a video on
 * a bench its first free bench).
 */
async function moveItem(item, to) {
  const plan = currentPlan();
  const from = placeOf(item, plan);
  const target = { room: to.room, slot: to.slot ?? null, bench: to.bench ?? null };
  if (target.slot == null && target.bench == null) {
    if (from.room === target.room) return;
    if (from.bench != null) {
      const free = plan.benches.find((b) => b.roomIndex === target.room - 1 && !b.video);
      if (!free) return toast(`“${roomTitle(target.room)}” has no free bench.`);
      target.bench = free.index;
    } else {
      const free = freeSpots(plan, target.room)[0];
      if (!free) return toast(`“${roomTitle(target.room)}” has no free spot — make it bigger first.`);
      target.slot = free.slot;
    }
  }
  // What's there now goes where this one was — or, if it can't (a photo on a bench), to a free spot in that room.
  const there = target.slot != null
    ? plan.spots.find((s) => s.roomIndex === target.room - 1 && s.slot === target.slot)?.photo
    : plan.benches.find((b) => b.roomIndex === target.room - 1 && b.index === target.bench)?.video;
  const other = there ? realItem(there) : null;
  if (other && other !== item) putAt(other, from.bench != null && !isVideoItem(other) ? { room: from.room } : from);
  putAt(item, target);
  selection = isVideoItem(item) ? { kind: 'video', id: item.id } : { kind: 'spot', room: target.room, slot: target.slot };
  await saveSpots();
  renderPhotosEverywhere();
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

// ── Adding photos and videos ──────────────────────────────────────────
/**
 * Resize each photo (or convert each video) in the browser, then save it on a
 * spot: the given one (`room` + `slot`), else the first free spot (in `room`,
 * or anywhere). `details[i]` can preset the texts, room and place of each photo.
 */
async function uploadFiles(files, { room = null, slot = null, details = [] } = {}) {
  const museumId = state.current.id;
  const items = files.map((file, i) => ({ file, extra: details[i] ?? {} }))
    .filter(({ file }) => file.type.startsWith('image/') || isHeic(file) || isVideo(file));
  if (!items.length) return;
  const failed = [];
  const added = { photos: 0, videos: 0, placed: 0 };
  let grew = null;
  for (const [i, { file, extra }] of items.entries()) {
    if (freeBytes() < 2 * MB) {
      failed.push(`${file.name} (the storage is full)`);
      continue;
    }
    // Where it goes: this spot, else the first free one.
    const wantedRoom = room ?? extra.room ?? null;
    const free = freeSpots(currentPlan(), wantedRoom)[0];
    const target = i === 0 && slot != null ? { room, slot }
      : free ? { room: free.roomIndex + 1, slot: free.slot }
        : { room: wantedRoom ?? museumConfig(state.current).rooms.length, slot: null }; // no free spot: that room grows
    if (isVideo(file)) {
      // Without a free spot, a video goes in front of a free bench instead. (addVideo says how it went.)
      if (await addVideo(file, target)) added.videos++;
      else failed.push(file.name);
      if (state.current?.id !== museumId) return;
      continue;
    }
    if (target.slot == null) grew = target.room;
    status(`Preparing ${i + 1} of ${items.length}: ${file.name}…`);
    try {
      const processed = await processImage(file);
      if (!processed.gps && Number.isFinite(extra.lat)) processed.gps = { lat: extra.lat, lng: extra.lng };
      const photo = await store.uploadPhoto(museumId, processed, {
        room: target.room,
        slot: target.slot,
        order: state.photos.length + 1,
        title: extra.title ?? titleFromFileName(file.name),
        date: extra.date ?? '',
        caption: extra.caption ?? '',
        place: extra.place ?? '',
      });
      added.photos++;
      if (photo.lat != null) added.placed++;
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
  if (items.length === 1 && isVideo(items[0].file)) return; // one video: addVideo's own message stays
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const what = [added.photos && plural(added.photos, 'photo'), added.videos && plural(added.videos, 'video')].filter(Boolean).join(' and ');
  const places = !added.photos ? ''
    : added.placed === added.photos ? ` · ${added.photos === 1 ? 'it' : 'all'} brought ${added.photos === 1 ? 'its' : 'their'} place along 📍`
      : ` · ${added.placed} of ${added.photos} brought ${added.photos === 1 ? 'its' : 'their'} place along 📍`;
  status(failed.length ? `Done, but these didn’t work: ${failed.join(', ')}` : `Added ${what} ♥${places}`);
  if (added.placed < added.photos) {
    toast(`${plural(added.photos - added.placed, 'photo')} came without the place where ${added.photos - added.placed === 1 ? 'it was' : 'they were'} taken (location off on the camera, or removed by a chat app or when sharing). Put ${added.photos - added.placed === 1 ? 'it' : 'them'} on the map in the Memory map tab.`, 8000);
  }
  if (grew) toast(`Every spot was taken, so “${roomTitle(grew)}” grew longer.`, 5000);
}

// "+ Add photos/videos": into the selected room, else the free spots in walking order.
$('.photos-input').addEventListener('change', (e) => {
  uploadFiles([...e.target.files], { room: selection?.kind === 'room' ? selection.index + 1 : null });
  e.target.value = '';
});

$('.add-samples').addEventListener('click', async () => {
  const base = new URL('../samples/', location.href);
  const list = await (await fetch(new URL('samples.json', base))).json();
  const files = await Promise.all(list.map(async (s) => {
    const blob = await (await fetch(new URL(s.file, base))).blob();
    return new File([blob], s.file, { type: 'image/jpeg' });
  }));
  await uploadFiles(files, { details: list.map(({ room, title, date, caption, place, lat, lng }) => ({ room, title, date, caption, place, lat, lng })) });
});

// Files dropped straight onto the floor plan: photos and videos onto a spot or a room, a video onto a bench.
const planWrap = $('.plan-wrap');
function isVideo(file) {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
}
planWrap.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  planView?.showDrop(planView.hitTest(e.clientX, e.clientY));
});
planWrap.addEventListener('dragleave', () => planView?.showDrop(null));
planWrap.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.files.length || !planView) return;
  e.preventDefault();
  const hit = planView.hitTest(e.clientX, e.clientY);
  planView.showDrop(null);
  const files = [...e.dataTransfer.files];
  if (hit.bench) {
    // Onto a bench: the (first) video hangs in front of it; anything else takes the room's free spots.
    const first = hit.bench.video ? null : files.find(isVideo);
    const room = hit.bench.roomIndex + 1;
    if (first) await addVideo(first, { room, bench: hit.bench.index });
    await uploadFiles(files.filter((f) => f !== first), { room });
  } else if (hit.spot && !hit.spot.photo) await uploadFiles(files, { room: hit.spot.roomIndex + 1, slot: hit.spot.slot });
  else await uploadFiles(files, { room: hit.spot ? hit.spot.roomIndex + 1 : hit.room ? hit.room.index + 1 : null });
});

// ── Guests ────────────────────────────────────────────────────────────
function renderGuests() {
  const list = $('.guest-list');
  const config = museumConfig(state.current);
  list.replaceChildren(...state.guests.map((email) => {
    const settings = guestSettings(config, email);
    const visit = state.visits.get(email);
    const row = document.createElement('div');
    row.className = 'guest-row';
    row.innerHTML = `
      <div class="guest-who">
        <span class="guest-email"></span>
        <input class="guest-name" placeholder="Name (optional)" maxlength="24" />
      </div>
      <span class="guest-visit"></span>
      <label class="guest-toggle"><input type="checkbox" data-setting="tour" /> Guided tour</label>
      <label class="guest-toggle"><input type="checkbox" data-setting="reducedMotion" /> Reduced motion</label>
      <button type="button" class="link guest-remove">Remove</button>`;
    $('.guest-email', row).textContent = email;
    $('.guest-name', row).value = settings.name;
    const v = $('.guest-visit', row);
    v.textContent = visit?.at ? `Last visited ${timeAgo(visit.at)}` : 'Not visited yet';
    if (visit?.at) v.title = visit.at.toLocaleString();
    for (const box of row.querySelectorAll('[data-setting]')) box.checked = Boolean(settings[box.dataset.setting]);
    let timer;
    $('.guest-name', row).addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveGuestSetting(email, { name: e.target.value.trim() }), 600);
    });
    row.addEventListener('change', (e) => {
      if (e.target.dataset.setting) saveGuestSetting(email, { [e.target.dataset.setting]: e.target.checked });
    });
    $('.guest-remove', row).addEventListener('click', async () => {
      await store.removeGuest(state.current.id, email);
      state.guests = state.guests.filter((g) => g !== email);
      renderGuests();
      renderStats();
    });
    return row;
  }));
  $('.guests-empty').hidden = state.guests.length > 0;
}

/** A guest's name / tour / reduced motion, saved on the museum. */
async function saveGuestSetting(email, patch) {
  const museum = state.current;
  const all = { ...(museum.guestSettings ?? {}) };
  all[email] = { ...guestSettings(museumConfig(museum), email), ...patch };
  museum.guestSettings = all;
  try {
    await store.saveMuseum(museum.id, { guestSettings: all });
    toast('Saved ✓', 1200);
  } catch (err) {
    console.error(err);
    toast('Couldn’t save — please try again.');
  }
}

/** "just now", "5 minutes ago", "yesterday", "3 Oct". */
function timeAgo(date) {
  const s = (Date.now() - date.getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hour${s < 5400 ? '' : 's'} ago`;
  if (s < 2 * 86400) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** How a guest is called: their name, else their email. */
const guestLabel = (email) => guestSettings(museumConfig(state.current), email).name || email;

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

// ── Videos (on a wall spot, or in front of a bench) ───────────────────
/** Convert a video and hang it on a spot (`slot`), in front of a bench (`bench`), or else in front of the room's first free bench. */
async function addVideo(file, { room, slot = null, bench = null }) {
  const museumId = state.current.id;
  const out = $('.video-status');
  const say = (text) => {
    out.textContent = text;
    status(text);
  };
  const space = Math.min(MAX_VIDEO_MB * MB, freeBytes());
  if (space < 5 * MB) return say(`There’s no room left for a video: ${megabytes(freeBytes())} free.`);
  try {
    say('Converting the video… 0%');
    const processed = await processVideo(file, {
      maxBytes: space,
      onProgress: (p) => say(`Converting the video… ${Math.round(p * 100)}%`),
    });
    const video = await store.uploadVideo(museumId, processed, {
      order: Math.max(0, ...state.videos.map((v) => v.order ?? 0)) + 1,
      room,
      slot,
      bench,
      title: titleFromFileName(file.name),
      caption: '',
    }, (n, total) => say(`Uploading… ${Math.round((n / total) * 100)}%`));
    if (state.current?.id === museumId) {
      state.videos.push(video);
      await settleSpots(); // on a bench, its screen covers a spot or two: photos there move to free spots
      selection = { kind: 'video', id: video.id };
      renderPhotosEverywhere();
      updateUsage();
    }
    say(`Video added ♥ (${megabytes(processed.bytes.length)}) — give it a title below.`);
    return true;
  } catch (err) {
    console.error(err);
    say(`That video didn’t work: ${err.message}`);
    return false;
  }
}

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
  const out = $('.music-status');
  try {
    state.current.music = await store.uploadMusic(state.current.id, file, (n, total) => {
      out.textContent = `Uploading… ${Math.round((n / total) * 100)}%`;
    });
    out.textContent = 'Song saved ♥';
    renderMusic();
    updateUsage();
  } catch (err) {
    console.error(err);
    out.textContent = 'Upload failed — please try again.';
  }
});

$('.remove-music').addEventListener('click', async () => {
  await store.removeMusic(state.current.id, state.current.music);
  state.current.music = null;
  renderMusic();
  updateUsage();
});

// ── Proposal ──────────────────────────────────────────────────────────
function renderProposal() {
  const form = $('.proposal-form');
  const p = museumConfig(state.current).proposal;
  const select = form.elements.proposer;
  select.replaceChildren(new Option('— choose a guest —', ''), ...state.guests.map((email) => new Option(guestLabel(email) === email ? email : `${guestLabel(email)} (${email})`, email)));
  if (p.proposer && !state.guests.includes(p.proposer)) select.append(new Option(`${p.proposer} (not a guest any more)`, p.proposer));
  for (const field of ['question', 'yes', 'no', 'after', 'metal', 'gem', 'proposer']) setField(form.elements[field], p[field], 'proposal');
  setField(form.elements.enabled, p.enabled, 'proposal');
  form.dataset.for = 'proposal';
  const answered = [...state.visits.entries()].find(([, v]) => v.yes);
  const out = $('.proposal-status');
  if (answered) {
    const [email, v] = answered;
    out.textContent = `💍 ${guestLabel(email)} said YES on ${v.yes.toLocaleDateString()}${v.dodges ? `, after trying to press “No” ${v.dodges} time${v.dodges === 1 ? '' : 's'}` : ''} ♥`;
  } else if (p.enabled && !p.proposer) out.textContent = 'Choose who kneels with the ring — they get the 💍 button.';
  else if (!state.guests.length) out.textContent = 'Add both of you as guests first (Guests tab).';
  else out.textContent = '';
}

autosaveForm($('.proposal-form'), (f) => ({
  proposal: {
    enabled: f.enabled.checked,
    proposer: f.proposer.value,
    question: f.question.value.trim() || 'Will you marry me?',
    yes: f.yes.value.trim() || 'YES',
    no: f.no.value.trim() || 'No',
    after: f.after.value.trim(),
    metal: f.metal.value,
    gem: f.gem.value,
  },
}), 700, () => state.tab === 'proposal' && renderProposal());

// ── Preview & layout editor ───────────────────────────────────────────
/**
 * What's selected on the floor plan: { kind: 'room', index } | { kind: 'spot', room, slot } | { kind: 'bench', room, bench }
 * | { kind: 'video', id } | { kind: 'start' } | { kind: 'finale' } | null.
 */
let selection = null;
let planView = null; // the drawn floor plan (for files dropped onto it)
const selectedRoom = () => (selection?.kind === 'room' ? selection.index : -1);

/** The museum's rooms (a copy, ready to edit). */
function rooms() {
  return museumConfig(state.current).rooms.map((r) => ({ ...r }));
}

/** Photo id → the key hunt's emoji, for the photos hiding a key. */
function keyedPhotos() {
  const hunt = museumConfig(state.current).hunt;
  return new Map(hiddenKeys(hunt, state.photos).map((k) => [k.photo, shapeOf(hunt).emoji]));
}

function renderPreview() {
  const config = museumConfig(state.current);
  planView = renderFloorPlan(config, state.photos, state.videos, {
    selected: selection,
    keys: keyedPhotos(),
    onSelect: (next) => {
      const same = selection && JSON.stringify(selection) === JSON.stringify(next);
      selection = same ? null : next;
      renderPreview();
      if (selection) document.querySelector('[data-panel="preview"] .panel:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    onDrop: (thing, to) => moveItem(realItem(thing), to),
  });
  $('.plan-wrap').replaceChildren(planView.svg);
  $('.add-mirror').hidden = config.mirror.enabled;
  renderRoomPanel(planView.plan);
  renderSpotPanel(planView.plan);
  renderMirrorPanel(planView.plan);
  renderVideoPanel(planView.plan);
  renderBenchPanel(planView.plan);
  renderStartPanel();
  renderFinalePanel();
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

/** The spot selected on the plan (or null). */
function selectedSpot(plan) {
  if (selection?.kind !== 'spot') return null;
  return plan.spots.find((s) => s.roomIndex === selection.room - 1 && s.slot === selection.slot && !s.blocked) ?? null;
}

/** The panel for the selected spot: its photo and texts, or a way to add one. */
let spotPhoto = null;
function renderSpotPanel(plan) {
  const panel = $('.spot-panel');
  const spot = selectedSpot(plan);
  panel.hidden = !spot || spot.photo?.isMirror || spot.photo?.isVideo;
  if (panel.hidden) return;
  const photo = spot.photo;
  $('.spot-filled', panel).hidden = !photo;
  $('.spot-empty-wrap', panel).hidden = Boolean(photo);
  if (!photo) {
    $('.sp-empty-title', panel).textContent = `Spot ${spot.number} is free`;
    $('.sp-mirror', panel).textContent = museumConfig(state.current).mirror.enabled ? '🪞 Move the mirror here' : '🪞 Hang the mirror here';
    spotPhoto = null;
    return;
  }
  const key = `photo-${photo.id}`;
  if (spotPhoto !== photo) {
    spotPhoto = photo;
    const img = $('.sp-photo', panel);
    img.src = thumbUrl(photo); // the small one first…
    imageUrl(state.current.id, photo.id, 'md').then((url) => spotPhoto === photo && (img.src = url)).catch(() => {}); // …then the sharp one
    $('.saved', panel).textContent = '';
  }
  // The key hunt's keys in this photo (moved in the Key hunt tab).
  const hunt = museumConfig(state.current).hunt;
  paintKeys($('.sp-frame', panel), hiddenKeys(hunt, state.photos).filter((k) => k.photo === photo.id), shapeOf(hunt).emoji);
  const place = photo.lat != null ? `📍 ${photo.place || `${photo.lat.toFixed(3)}, ${photo.lng.toFixed(3)}`}` : 'no place on the map yet (Memory map tab)';
  $('.sp-where', panel).textContent = `Spot ${spot.number} · ${roomTitle(spot.roomIndex + 1)} · ${place}`;
  for (const name of ['title', 'date', 'caption']) setField(panel.querySelector(`[name="${name}"]`), photo[name], key);
  panel.dataset.for = key;
}

// A click on the photo shows it big (with its keys).
$('.spot-panel .sp-frame').addEventListener('click', () => {
  const photo = spotPhoto;
  if (!photo) return;
  const hunt = museumConfig(state.current).hunt;
  openZoom({
    lowSrc: thumbUrl(photo),
    src: imageUrl(state.current.id, photo.id, 'lg'),
    text: [photo.title, photo.date].filter(Boolean).join(' · '),
    decorate: (frame) => paintKeys(frame, hiddenKeys(hunt, state.photos).filter((k) => k.photo === photo.id), shapeOf(hunt).emoji),
  });
});

let spotSaver = null;
$('.spot-filled').addEventListener('input', () => {
  if (!spotPhoto) return;
  if (spotSaver?.photo !== spotPhoto) spotSaver = { photo: spotPhoto, save: autosavePhoto(state.current.id, spotPhoto, $('.spot-filled'), $('.spot-panel .saved')) };
  spotSaver.save();
});

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

// ── The mirror ────────────────────────────────────────────────────────
$('.sp-mirror').addEventListener('click', async () => {
  if (selection?.kind !== 'spot') return;
  const { room, slot } = selection;
  putAt(MIRROR, { room, slot });
  await saveMirror();
  selection = { kind: 'spot', room, slot };
  renderPreview();
});

$('.add-mirror').addEventListener('click', async () => {
  state.current.mirror = { ...museumConfig(state.current).mirror, enabled: true, room: null, slot: null };
  await saveMirror();
  const spot = currentPlan().spots.find((s) => s.photo?.isMirror);
  if (spot) selection = { kind: 'spot', room: spot.roomIndex + 1, slot: spot.slot };
  renderPreview();
  toast('The mirror is up 🪞 — add its pictures below.');
});

$('.mirror-remove').addEventListener('click', async () => {
  state.current.mirror = { ...museumConfig(state.current).mirror, enabled: false };
  selection = null;
  await saveMirror();
  renderPreview();
  toast('The mirror is taken down (its pictures are kept). “+ Mirror” hangs it again.', 5000);
});

/** Save where the mirror hangs (and settle the photos around it). */
async function saveMirror() {
  status('Saving…');
  try {
    await settleSpots();
    await store.saveMuseum(state.current.id, { mirror: museumConfig(state.current).mirror });
    status('Saved ✓');
  } catch (err) {
    console.error(err);
    status('Couldn’t save — try again.');
  }
}

function renderMirrorPanel(plan) {
  const panel = $('.mirror-panel');
  const spot = selectedSpot(plan);
  panel.hidden = !spot?.photo?.isMirror;
  if (panel.hidden) return;
  // One row per guest (their own pictures), plus pictures for everyone else.
  const people = [...state.guests.map((email) => ({ for: email, label: guestLabel(email) })), { for: '', label: 'Everyone else (and the curator)' }];
  $('.mirror-people', panel).replaceChildren(...people.map((person) => {
    const row = document.createElement('section');
    row.className = 'mirror-person';
    row.innerHTML = `<h4></h4><div class="mirror-thumbs"></div>`;
    $('h4', row).textContent = person.label;
    const thumbs = $('.mirror-thumbs', row);
    for (const image of state.mirror.filter((m) => (m.for ?? '') === person.for)) {
      const fig = document.createElement('figure');
      fig.className = 'mirror-thumb';
      const img = new Image();
      img.src = thumbUrl(image);
      img.alt = '';
      img.title = 'Click to see it bigger';
      img.addEventListener('click', () => openZoom({ lowSrc: thumbUrl(image), src: imageUrl(state.current.id, image.id, 'lg'), text: `In the mirror for ${person.label}` }));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mirror-delete';
      del.setAttribute('aria-label', 'Remove this picture');
      del.textContent = '×';
      del.addEventListener('click', () => deleteMirrorImage(image));
      fig.append(img, del);
      thumbs.append(fig);
    }
    const add = document.createElement('label');
    add.className = 'mirror-add';
    add.innerHTML = '<input type="file" accept="image/*,.heic,.heif" multiple hidden /><span>+</span><small>Add</small>';
    $('input', add).addEventListener('change', (e) => {
      addMirrorImages([...e.target.files], person.for);
      e.target.value = '';
    });
    thumbs.append(add);
    return row;
  }));
}

async function addMirrorImages(files, forEmail) {
  const museumId = state.current.id;
  const out = $('.mirror-status');
  for (const [i, file] of files.entries()) {
    if (freeBytes() < 2 * MB) {
      out.textContent = 'The storage is full.';
      break;
    }
    out.textContent = `Preparing ${i + 1} of ${files.length}…`;
    try {
      const processed = await processImage(file);
      const image = await store.uploadMirrorImage(museumId, processed, {
        for: forEmail,
        order: Math.max(0, ...state.mirror.map((m) => m.order ?? 0)) + 1,
      });
      if (state.current?.id !== museumId) return;
      state.mirror.push(image);
      updateUsage();
      renderPreview();
    } catch (err) {
      console.error(err);
      out.textContent = `${file.name} didn’t work: ${err.message}`;
      return;
    }
  }
  out.textContent = 'Added to the mirror ♥';
}

async function deleteMirrorImage(image) {
  if (!confirm('Remove this picture from the mirror?')) return;
  await store.deleteMirrorImage(state.current.id, image.id);
  state.mirror = state.mirror.filter((m) => m !== image);
  updateUsage();
  renderPreview();
}

// ── Video and bench panels ────────────────────────────────────────────
let panelVideo = null;
function renderVideoPanel(plan) {
  const panel = $('.video-panel');
  const video = selection?.kind === 'video' ? state.videos.find((v) => v.id === selection.id) : null;
  panel.hidden = !video;
  if (!video) return;
  const key = `video-${video.id}`;
  if (panelVideo !== video) {
    panelVideo = video;
    $('.vp-poster', panel).src = posterUrl(video);
  }
  const bench = plan.benches.find((b) => b.video?.id === video.id);
  const spot = plan.spots.find((sp) => sp.photo?.isVideo && sp.photo.id === video.id);
  const minutes = `${Math.floor(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')}`;
  $('.vp-where', panel).textContent = spot
    ? `▶ On spot ${spot.number} in ${roomTitle(spot.roomIndex + 1)}: it plays in its frame while someone stands in front of it. Drag the ▶ onto another spot or a bench to move it.`
    : `▶ At a bench in ${roomTitle((bench?.roomIndex ?? 0) + 1)}: it plays when someone sits there. Drag the ▶ onto another bench or a free spot to move it.`;
  $('.vp-info', panel).textContent = `${minutes} · ${megabytes(video.size)}`;
  for (const name of ['title', 'caption']) setField(panel.querySelector(`[name="${name}"]`), video[name], key);
  panel.dataset.for = key;
}

$('.vp-frame').addEventListener('click', () => {
  const video = panelVideo;
  if (video) openZoom({ lowSrc: posterUrl(video), video: videoUrl(state.current.id, video.id, video), text: video.title });
});

let videoTimer;
$('.video-panel').addEventListener('input', () => {
  const video = panelVideo;
  const museumId = state.current.id;
  const panel = $('.video-panel');
  clearTimeout(videoTimer);
  videoTimer = setTimeout(async () => {
    const patch = { title: panel.querySelector('[name="title"]').value.trim(), caption: panel.querySelector('[name="caption"]').value.trim() };
    try {
      await store.updateVideo(museumId, video.id, patch);
      Object.assign(video, patch);
      status('Saved ✓');
    } catch (err) {
      console.error(err);
      status('Couldn’t save — try again.');
    }
  }, 600);
});

$('.vp-delete').addEventListener('click', async () => {
  const video = panelVideo;
  if (!video || !confirm(`Delete the video “${video.title || 'untitled'}”?`)) return;
  await store.deleteVideo(state.current.id, video);
  state.videos = state.videos.filter((v) => v !== video);
  selection = null;
  await settleSpots(); // the spots behind its screen are free again
  renderPreview();
  updateUsage();
});

function renderBenchPanel(plan) {
  const panel = $('.bench-panel');
  const bench = selection?.kind === 'bench' ? plan.benches.find((b) => b.roomIndex === selection.room - 1 && b.index === selection.bench) : null;
  panel.hidden = !bench || Boolean(bench.video);
  if (panel.hidden) return;
  $('.bp-title', panel).textContent = `Add a video to this bench in “${roomTitle(selection.room)}”`;
}

$('.video-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file && selection?.kind === 'bench') addVideo(file, { room: selection.room, bench: selection.bench });
});
const benchDrop = $('.bench-drop');
benchDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  benchDrop.classList.add('over');
});
benchDrop.addEventListener('dragleave', () => benchDrop.classList.remove('over'));
benchDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  benchDrop.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file && selection?.kind === 'bench') addVideo(file, { room: selection.room, bench: selection.bench });
});

// ── Start screen and hidden room ──────────────────────────────────────
function renderStartPanel() {
  const panel = $('.start-panel');
  panel.hidden = selection?.kind !== 'start';
  if (panel.hidden) return;
  const c = museumConfig(state.current);
  const f = panel.elements;
  for (const [field, value] of [['name', state.current.name], ['slug', state.current.slug], ['title', c.title], ['subtitle', c.subtitle], ['language', c.language], ['decoration', c.decoration]]) {
    setField(f[field], value, 'start');
  }
  const now = resolveDecoration(c.decoration);
  $('.decoration-now', panel).textContent = c.decoration === 'seasonal'
    ? `Right now that's ${DECORATIONS[now].emoji} ${DECORATIONS[now].label}.`
    : '';
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

/** Save a form's fields a moment after typing stops (a ticked box or a choice: at once). */
function autosaveForm(form, patchFrom, delay = 700, after = null) {
  let timer;
  const run = async (museum) => {
    const patch = patchFrom(form.elements, museum);
    status('Saving…');
    try {
      await store.saveMuseum(museum.id, patch);
      Object.assign(museum, patch); // state.current is also the entry in state.museums
      status('Saved ✓');
      if (form.closest('[data-panel]')?.dataset.panel !== 'preview') toast('Saved ✓', 1200);
    } catch (err) {
      console.error(err);
      status('Couldn’t save — try again.');
      toast('Couldn’t save — please try again.');
    }
    if (museum !== state.current) return;
    renderLinks();
    renderMuseumList();
    $('.editor-title').textContent = museum.name || museum.title;
    if (state.tab === 'preview') renderPreview();
    after?.();
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  const schedule = (e) => {
    const museum = state.current;
    clearTimeout(timer);
    const now = e.target.type === 'checkbox' || e.target.tagName === 'SELECT' || e.target.type === 'color';
    timer = setTimeout(() => run(museum), now ? 0 : delay);
  };
  form.addEventListener('input', schedule);
  form.addEventListener('change', (e) => e.target.tagName === 'SELECT' && schedule(e));
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
    decoration: f.decoration.value,
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
 * Change the rooms list (and, if rooms moved, the photos/videos/mirror that
 * live in them). The page updates at once, so quick clicks build on each
 * other; the database follows.
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
    for (const p of state.photos) {
      if (renumber(p.room) !== p.room) moved.add(p);
      p.room = renumber(p.room); // they keep their spots (or take free ones)
    }
    const m = museumConfig(state.current).mirror;
    if (m.room != null) state.current.mirror = { ...m, room: renumber(m.room) };
  }
  renderStats();
  renderPreview();
  status('Saving…');
  savesInFlight++;
  try {
    await store.updateVideos(museumId, videoUpdates);
    await store.saveMuseum(museumId, { rooms: nextRooms, ...(renumber ? { mirror: museumConfig(state.current).mirror } : {}) });
    if (state.current?.id === museumId) await settleSpots(); // a resized room has other spots
    if (--savesInFlight === 0) status('Saved ✓');
  } catch (err) {
    savesInFlight--;
    console.error(err);
    status('Couldn’t save — try again.');
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

// ── Key hunt and memory map tabs ──────────────────────────────────────
const huntTab = createHuntTab($('[data-panel="hunt"]'), {
  museum: () => state.current,
  photos: () => state.photos,
  save: (museum, patch) => store.saveMuseum(museum.id, patch),
  toast,
  thumbUrl,
  imageUrl: (photo, size) => imageUrl(state.current.id, photo.id, size),
  finds: () => store.listHuntFinds(state.current.id),
  resetFinds: () => store.resetHunt(state.current.id),
  onChange: () => renderStats(),
});

const mapTab = createMapTab($('[data-panel="map"]'), {
  museum: () => state.current,
  photos: () => state.photos,
  thumbUrl,
  savePhoto: (photo, patch) => store.updatePhoto(state.current.id, photo.id, patch),
  saveMuseum: (museum, patch) => store.saveMuseum(museum.id, patch),
  toast,
});

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
