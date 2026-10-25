/**
 * The curator page (/admin): create a museum per couple, upload their photos
 * and videos, write their texts and message, choose their song, and decide
 * which Google accounts may enter. Each museum has its own link (…/?m=name). Only the admin email(s) in firebase-config.js get past
 * the sign-in gate — and the database rules enforce the same thing.
 */
import '@fontsource/eb-garamond/500.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import './admin.css';

import { watchUser, signInWithGoogle, signOutUser, signInErrorMessage, isAdminEmail, isConfigured } from '../backend/firebase.js';
import { loadMusicUrl } from '../backend/museumData.js';
import { museumConfig } from '../museumConfig.js';
import * as store from './store.js';
import { processImage, isHeic, titleFromFileName } from './imageTools.js';
import { processVideo, MAX_SECONDS } from './videoTools.js';
import { renderFloorPlan } from './floorPlan.js';

const $ = (selector, root = document) => root.querySelector(selector);
const MAX_SONG_BYTES = 8 * 1024 * 1024;

const state = {
  museums: [],
  current: null, // the museum being edited ({ id, ...data })
  photos: [],
  videos: [],
  guests: [],
  tab: 'photos',
};

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
  ].join(' · ');
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
  ({ photos: renderPhotos, videos: renderVideos, guests: renderGuests, texts: renderTexts, music: renderMusic, preview: renderPreview })[state.tab]();
}

// ── Photos ────────────────────────────────────────────────────────────
function roomOptions(select, selected) {
  select.replaceChildren();
  museumConfig(state.current).rooms.forEach((r, i) => {
    const o = new Option(`${i + 1}. ${r.title}`, String(i + 1));
    o.selected = Number(selected) === i + 1;
    select.append(o);
  });
}

function renderPhotos() {
  const uploadRoom = $('.upload-room');
  roomOptions(uploadRoom, uploadRoom.value || state.photos.at(-1)?.room || 1);
  $('.photos-empty').hidden = state.photos.length > 0;
  const grid = $('.photo-grid');
  grid.replaceChildren(...state.photos.map((photo, i) => photoCard(photo, i)));
}

function photoCard(photo, index) {
  const museumId = state.current.id; // saves go to this museum, even if you switch meanwhile
  const card = document.createElement('article');
  card.className = 'photo-card';
  card.dataset.id = photo.id;
  card.innerHTML = `
    <div class="photo-thumb"><span class="photo-number">${index + 1}</span></div>
    <div class="photo-fields">
      <input name="title" placeholder="Title" maxlength="80" />
      <input name="date" placeholder="Date — any text, e.g. Summer 2021" maxlength="60" />
      <textarea name="caption" rows="2" placeholder="Caption" maxlength="400"></textarea>
      <div class="photo-row">
        <select name="room" aria-label="Room"></select>
        <button type="button" class="icon" data-move="-1" aria-label="Move earlier">←</button>
        <button type="button" class="icon" data-move="1" aria-label="Move later">→</button>
        <span class="saved"></span>
        <button type="button" class="icon danger" data-delete aria-label="Delete photo">🗑</button>
      </div>
    </div>`;
  const img = new Image();
  img.alt = '';
  img.src = URL.createObjectURL(new Blob([photo.thumb.toUint8Array()], { type: 'image/jpeg' }));
  $('.photo-thumb', card).prepend(img);

  for (const name of ['title', 'date', 'caption']) card.querySelector(`[name="${name}"]`).value = photo[name] ?? '';
  roomOptions(card.querySelector('[name="room"]'), photo.room);

  // Save changes automatically, a moment after typing stops.
  let timer;
  const saved = $('.saved', card);
  const save = () => {
    clearTimeout(timer);
    saved.textContent = '…';
    timer = setTimeout(async () => {
      const patch = {
        title: card.querySelector('[name="title"]').value.trim(),
        date: card.querySelector('[name="date"]').value.trim(),
        caption: card.querySelector('[name="caption"]').value.trim(),
        room: Number(card.querySelector('[name="room"]').value),
      };
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
  card.addEventListener('input', save);
  card.addEventListener('change', save);

  for (const b of card.querySelectorAll('[data-move]')) {
    b.addEventListener('click', async () => {
      const i = state.photos.indexOf(photo);
      const j = i + Number(b.dataset.move);
      if (j < 0 || j >= state.photos.length) return;
      await store.swapOrder(museumId, photo, state.photos[j]);
      [state.photos[i], state.photos[j]] = [state.photos[j], state.photos[i]];
      renderPhotos();
    });
  }
  $('[data-delete]', card).addEventListener('click', async () => {
    if (!confirm(`Delete “${photo.title || 'this photo'}”?`)) return;
    await store.deletePhoto(museumId, photo.id);
    state.photos = state.photos.filter((p) => p !== photo);
    renderPhotos();
    renderStats();
  });
  return card;
}

const dropzone = $('.dropzone');
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

/** Resize each photo in the browser, then save it. `details[i]` can preset the texts. */
async function uploadFiles(files, details = []) {
  const museumId = state.current.id;
  const items = files.map((file, i) => ({ file, extra: details[i] ?? {} }))
    .filter(({ file }) => file.type.startsWith('image/') || isHeic(file));
  if (!items.length) return;
  const status = $('.upload-status');
  const room = Number($('.upload-room').value) || 1;
  let order = Math.max(0, ...state.photos.map((p) => p.order ?? 0)) + 1;
  const failed = [];
  for (const [i, { file, extra }] of items.entries()) {
    status.textContent = `Preparing ${i + 1} of ${items.length}: ${file.name}…`;
    try {
      const processed = await processImage(file);
      const photo = await store.uploadPhoto(museumId, processed, {
        order: order++,
        room: extra.room ?? room,
        title: extra.title ?? titleFromFileName(file.name),
        date: extra.date ?? '',
        caption: extra.caption ?? '',
      });
      if (state.current?.id !== museumId) continue; // switched museum meanwhile
      state.photos.push(photo);
      renderPhotos();
      renderStats();
    } catch (err) {
      console.error(err);
      failed.push(`${file.name} (${err.message})`);
    }
  }
  status.textContent = failed.length
    ? `Done, but these didn’t work: ${failed.join(', ')}`
    : `Added ${items.length} photo${items.length === 1 ? '' : 's'} ♥`;
}

$('.add-samples').addEventListener('click', async () => {
  const base = new URL('../samples/', location.href);
  const list = await (await fetch(new URL('samples.json', base))).json();
  const files = await Promise.all(list.map(async (s) => {
    const blob = await (await fetch(new URL(s.file, base))).blob();
    return new File([blob], s.file, { type: 'image/jpeg' });
  }));
  await uploadFiles(files, list.map(({ room, title, date, caption }) => ({ room, title, date, caption })));
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

// ── Texts & rooms ─────────────────────────────────────────────────────
const textsForm = $('.texts-form');
let draftRooms = [];

function renderTexts() {
  const c = museumConfig(state.current);
  const f = textsForm.elements;
  f.name.value = state.current.name ?? '';
  f.slug.value = state.current.slug ?? '';
  f.title.value = c.title;
  f.subtitle.value = c.subtitle;
  f.language.value = c.language;
  f.finaleEnabled.checked = c.finale.enabled;
  f.doorSign.value = c.finale.doorSign;
  f.finaleTitle.value = c.finale.title;
  f.message.value = c.finale.message;
  f.signature.value = c.finale.signature;
  draftRooms = c.rooms.map((r) => ({ ...r }));
  renderRooms();
  $('.save-state').textContent = '';
}

function renderRooms() {
  const wrap = $('.rooms-editor');
  wrap.replaceChildren(...draftRooms.map((room, i) => {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `
      <span class="room-number">${i + 1}</span>
      <input class="room-title" aria-label="Room ${i + 1} name" maxlength="40" />
      <label class="color" title="Wall colour"><input type="color" class="room-wall" /> walls</label>
      <label class="color" title="Text colour"><input type="color" class="room-trim" /> text</label>
      <button type="button" class="icon" data-up aria-label="Move up">↑</button>
      <button type="button" class="icon danger" data-remove aria-label="Remove room">×</button>`;
    const title = $('.room-title', row);
    title.value = room.title;
    title.addEventListener('input', () => (room.title = title.value));
    $('.room-wall', row).value = room.wall;
    $('.room-wall', row).addEventListener('input', (e) => (room.wall = e.target.value));
    $('.room-trim', row).value = room.trim;
    $('.room-trim', row).addEventListener('input', (e) => (room.trim = e.target.value));
    $('[data-up]', row).addEventListener('click', () => {
      if (i === 0) return;
      [draftRooms[i - 1], draftRooms[i]] = [draftRooms[i], draftRooms[i - 1]];
      renderRooms();
      dirty();
    });
    $('[data-remove]', row).addEventListener('click', () => {
      if (draftRooms.length === 1) return toast('A museum needs at least one room.');
      draftRooms.splice(i, 1);
      renderRooms();
      dirty();
    });
    return row;
  }));
}

$('.add-room').addEventListener('click', () => {
  draftRooms.push({ title: `Room ${draftRooms.length + 1}`, wall: '#ece3d6', trim: '#6b4a35' });
  renderRooms();
  dirty();
});

function dirty() {
  $('.save-state').textContent = 'Unsaved changes';
}
textsForm.addEventListener('input', dirty);

textsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = textsForm.elements;
  const wantedSlug = store.slugify(f.slug.value || f.name.value || state.current.name);
  const slug = store.uniqueSlug(wantedSlug, state.museums, state.current.id);
  if (slug !== wantedSlug) toast(`“${wantedSlug}” is already another museum’s link, so this one is “${slug}”.`, 6000);
  const patch = {
    slug,
    name: f.name.value.trim() || state.current.name,
    title: f.title.value.trim(),
    subtitle: f.subtitle.value.trim(),
    language: f.language.value,
    rooms: draftRooms.map((r) => ({ title: r.title.trim() || 'Room', wall: r.wall, trim: r.trim })),
    finale: {
      enabled: f.finaleEnabled.checked,
      doorSign: f.doorSign.value.trim(),
      title: f.finaleTitle.value.trim(),
      message: f.message.value,
      signature: f.signature.value.trim(),
    },
  };
  await store.saveMuseum(state.current.id, patch);
  Object.assign(state.current, patch); // state.current is also the entry in state.museums
  f.slug.value = slug;
  renderLinks();
  renderMuseumList();
  $('.editor-title').textContent = patch.name;
  renderStats();
  $('.save-state').textContent = 'Saved ✓';
});

$('.delete-museum').addEventListener('click', async () => {
  const name = state.current.name || state.current.title;
  if (!confirm(`Delete “${name}” with all its photos, music and guest list? This can’t be undone.`)) return;
  toast('Deleting…');
  await store.deleteMuseum(state.current.id);
  state.current = null;
  toast(`“${name}” was deleted.`);
  await refreshMuseums();
});

// ── Videos ────────────────────────────────────────────────────────────
function renderVideos() {
  const select = $('.video-room');
  roomOptions(select, select.value || state.videos.at(-1)?.room || 1);
  $('.videos-empty').hidden = state.videos.length > 0;
  $('.video-grid').replaceChildren(...state.videos.map((video, i) => videoCard(video, i)));
}

function videoCard(video, index) {
  const museumId = state.current.id; // saves go to this museum, even if you switch meanwhile
  const card = document.createElement('article');
  card.className = 'photo-card';
  card.dataset.id = video.id;
  const minutes = `${Math.floor(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')}`;
  card.innerHTML = `
    <div class="photo-thumb"><span class="photo-number">▶ ${index + 1}</span></div>
    <div class="photo-fields">
      <input name="title" placeholder="Title" maxlength="80" />
      <textarea name="caption" rows="2" placeholder="Caption (optional)" maxlength="300"></textarea>
      <div class="photo-row">
        <select name="room" aria-label="Room"></select>
        <span class="saved">${minutes} · ${(video.size / 1048576).toFixed(1)} MB</span>
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
    renderStats();
  });
  return card;
}

$('.video-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const museumId = state.current.id;
  const status = $('.video-status');
  try {
    status.textContent = 'Converting… 0%';
    const processed = await processVideo(file, (p) => (status.textContent = `Converting… ${Math.round(p * 100)}%`));
    const video = await store.uploadVideo(museumId, processed, {
      order: Math.max(0, ...state.videos.map((v) => v.order ?? 0)) + 1,
      room: Number($('.video-room').value) || 1,
      title: titleFromFileName(file.name),
      caption: '',
    }, (n, total) => (status.textContent = `Uploading… ${Math.round((n / total) * 100)}%`));
    if (state.current?.id === museumId) {
      state.videos.push(video);
      renderVideos();
      renderStats();
    }
    const trimmed = processed.duration >= MAX_SECONDS - 0.5 ? ` (trimmed to ${MAX_SECONDS / 60} minutes)` : '';
    status.textContent = `Video added ♥${trimmed} — give it a title above.`;
  } catch (err) {
    console.error(err);
    status.textContent = `That video didn’t work: ${err.message}`;
  }
});

// ── Music ─────────────────────────────────────────────────────────────
async function renderMusic() {
  const music = state.current.music;
  const kb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  $('.music-current').textContent = music
    ? `Playing: ${music.name} (${kb(music.size)})`
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
  } catch (err) {
    console.error(err);
    status.textContent = 'Upload failed — please try again.';
  }
});

$('.remove-music').addEventListener('click', async () => {
  await store.removeMusic(state.current.id, state.current.music);
  state.current.music = null;
  renderMusic();
});

// ── Preview (floor plan) ──────────────────────────────────────────────
function renderPreview() {
  const svg = renderFloorPlan(museumConfig(state.current), state.photos, state.videos, (item) => {
    state.tab = state.videos.includes(item) ? 'videos' : 'photos';
    renderTab();
    const card = document.querySelector(`.photo-card[data-id="${item.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.classList.add('flash');
    setTimeout(() => card?.classList.remove('flash'), 1600);
  });
  $('.plan-wrap').replaceChildren(svg);
}

// ── Little helpers ────────────────────────────────────────────────────
function toast(text, ms = 3500) {
  const t = $('.toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}
