/**
 * Everything the curator page writes to the database. (The security rules
 * only allow these writes for the admin email — see firestore.rules.)
 *
 *   access/{email}                     { museums: [ids] }   ← guest lists
 *   museums/{id}                       texts, rooms, message, music info
 *   museums/{id}/photos/{photoId}      details + tiny thumbnail
 *   museums/{id}/images/{photoId}-md   1024 px JPEG bytes (on the wall)
 *   museums/{id}/images/{photoId}-lg   1600 px JPEG bytes (full screen)
 *   museums/{id}/music/{version}-{n}   the song, in pieces of < 1 MB
 *   museums/{id}/videos/{videoId}      video details + poster picture
 *   museums/{id}/videochunks/{videoId}-{n}   the video, in pieces of < 1 MB
 *
 * Guest lists are mirrored to the Realtime Database (access/{email,with,commas})
 * because the live-avatar rules there can't read Firestore.
 */
import { getFirestoreDb, getRealtimeDb } from '../backend/firebase.js';
import { newMuseumData } from '../museumConfig.js';

const CHUNK = 900 * 1024; // a database document holds at most 1 MB

// ── Links: each museum gets its own readable address, …/?m=maria-nikos ─
const GREEK = { α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', ϋ: 'y', ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o' };

/** "Μαρία & Νίκος" → "maria-nikos", "Anna & Ben!" → "anna-ben". */
export function slugify(text) {
  return String(text).toLowerCase().replace(/[α-ωάέήίόύώϊϋΐΰς]/g, (c) => GREEK[c] ?? '')
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'museum';
}

/** A slug not used by any other museum (adds -2, -3… if needed). */
export function uniqueSlug(wanted, museums, exceptId = null) {
  const taken = new Set(museums.filter((m) => m.id !== exceptId).map((m) => m.slug));
  let slug = slugify(wanted);
  for (let n = 2; taken.has(slug); n++) slug = `${slugify(wanted).slice(0, 36)}-${n}`;
  return slug;
}

async function fsdb() {
  return getFirestoreDb();
}

// ── Museums ───────────────────────────────────────────────────────────
export async function listMuseums() {
  const { db, fs } = await fsdb();
  const snap = await fs.getDocs(fs.collection(db, 'museums'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
}

export async function createMuseum(name, existingMuseums = []) {
  const { db, fs } = await fsdb();
  const ref = await fs.addDoc(fs.collection(db, 'museums'), {
    ...newMuseumData(name),
    slug: uniqueSlug(name, existingMuseums),
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  return ref.id;
}

export async function saveMuseum(id, patch) {
  const { db, fs } = await fsdb();
  await fs.updateDoc(fs.doc(db, 'museums', id), { ...patch, updatedAt: fs.serverTimestamp() });
}

/** Deletes a museum with all its photos, music and guest-list entries. */
export async function deleteMuseum(id) {
  const { db, fs } = await fsdb();
  for (const part of ['photos', 'images', 'music', 'videos', 'videochunks']) {
    const snap = await fs.getDocs(fs.collection(db, 'museums', id, part));
    for (const d of snap.docs) await fs.deleteDoc(d.ref); // one by one: image documents are big
  }
  for (const email of await listGuests(id)) await removeGuest(id, email, { sync: false });
  await fs.deleteDoc(fs.doc(db, 'museums', id));
  await syncAccessMirror();
}

// ── Guests ────────────────────────────────────────────────────────────
export async function listGuests(museumId) {
  const { db, fs } = await fsdb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'access'), fs.where('museums', 'array-contains', museumId)));
  return snap.docs.map((d) => d.id).sort();
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email);
}

/** The museums an email is already invited to (to warn about duplicates). */
export async function museumsOfGuest(email) {
  const { db, fs } = await fsdb();
  const snap = await fs.getDoc(fs.doc(db, 'access', normalizeEmail(email)));
  return snap.exists() ? snap.data().museums ?? [] : [];
}

export async function addGuest(museumId, email) {
  const { db, fs } = await fsdb();
  email = normalizeEmail(email);
  await fs.setDoc(fs.doc(db, 'access', email), { museums: fs.arrayUnion(museumId) }, { merge: true });
  await syncAccessMirror();
}

export async function removeGuest(museumId, email, { sync = true } = {}) {
  const { db, fs } = await fsdb();
  await fs.updateDoc(fs.doc(db, 'access', normalizeEmail(email)), { museums: fs.arrayRemove(museumId) });
  if (sync) await syncAccessMirror();
}

/**
 * Copies every guest list to the Realtime Database (where the live-avatar
 * rules check it). Firestore is the source of truth; this rewrites the copy.
 */
export async function syncAccessMirror() {
  const { db, fs } = await fsdb();
  const snap = await fs.getDocs(fs.collection(db, 'access'));
  const mirror = {};
  for (const d of snap.docs) {
    const museums = d.data().museums ?? [];
    if (!museums.length) continue;
    mirror[d.id.replaceAll('.', ',')] = Object.fromEntries(museums.map((m) => [m, true]));
  }
  const { db: rtdb, rt } = await getRealtimeDb();
  await rt.set(rt.ref(rtdb, 'access'), mirror);
}

// ── Photos ────────────────────────────────────────────────────────────
export async function listPhotos(museumId) {
  const { db, fs } = await fsdb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'museums', museumId, 'photos'), fs.orderBy('order')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Saves one processed photo (see imageTools.js): details, thumbnail and both
 * sizes, all at once.
 */
export async function uploadPhoto(museumId, processed, details) {
  const { db, fs } = await fsdb();
  const photoRef = fs.doc(fs.collection(db, 'museums', museumId, 'photos'));
  const batch = fs.writeBatch(db);
  const data = {
    ...details,
    width: processed.width,
    height: processed.height,
    color: processed.color,
    thumb: fs.Bytes.fromUint8Array(processed.thumb),
    createdAt: fs.serverTimestamp(),
  };
  batch.set(photoRef, data);
  batch.set(fs.doc(db, 'museums', museumId, 'images', `${photoRef.id}-md`), { data: fs.Bytes.fromUint8Array(processed.md) });
  batch.set(fs.doc(db, 'museums', museumId, 'images', `${photoRef.id}-lg`), { data: fs.Bytes.fromUint8Array(processed.lg) });
  await batch.commit();
  return { id: photoRef.id, ...data };
}

export async function updatePhoto(museumId, photoId, patch) {
  const { db, fs } = await fsdb();
  await fs.updateDoc(fs.doc(db, 'museums', museumId, 'photos', photoId), patch);
}

export async function deletePhoto(museumId, photoId) {
  const { db, fs } = await fsdb();
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, 'museums', museumId, 'photos', photoId));
  batch.delete(fs.doc(db, 'museums', museumId, 'images', `${photoId}-md`));
  batch.delete(fs.doc(db, 'museums', museumId, 'images', `${photoId}-lg`));
  await batch.commit();
}

/** Swap the walking order of two photos. */
export async function swapOrder(museumId, a, b) {
  const { db, fs } = await fsdb();
  const batch = fs.writeBatch(db);
  batch.update(fs.doc(db, 'museums', museumId, 'photos', a.id), { order: b.order });
  batch.update(fs.doc(db, 'museums', museumId, 'photos', b.id), { order: a.order });
  await batch.commit();
  [a.order, b.order] = [b.order, a.order];
}

// ── Music ─────────────────────────────────────────────────────────────
/** Stores a song in < 1 MB pieces (a database document can't hold more). */
export async function uploadMusic(museumId, file, onProgress = () => {}) {
  const { db, fs } = await fsdb();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = Math.ceil(bytes.length / CHUNK);
  const version = String(Date.now());
  for (let i = 0; i < chunks; i++) {
    const piece = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
    await fs.setDoc(fs.doc(db, 'museums', museumId, 'music', `${version}-${i}`), { data: fs.Bytes.fromUint8Array(piece) });
    onProgress(i + 1, chunks);
  }
  const museum = await fs.getDoc(fs.doc(db, 'museums', museumId));
  const previous = museum.data()?.music;
  const music = { name: file.name, type: file.type || 'audio/mpeg', size: bytes.length, chunks, version };
  await saveMuseum(museumId, { music });
  if (previous?.version) await deleteMusicPieces(museumId, previous);
  return music;
}

export async function removeMusic(museumId, music) {
  await saveMuseum(museumId, { music: null });
  if (music?.version) await deleteMusicPieces(museumId, music);
}

async function deleteMusicPieces(museumId, music) {
  const { db, fs } = await fsdb();
  for (let i = 0; i < music.chunks; i++) {
    await fs.deleteDoc(fs.doc(db, 'museums', museumId, 'music', `${music.version}-${i}`));
  }
}

// ── Videos ────────────────────────────────────────────────────────────
export async function listVideos(museumId) {
  const { db, fs } = await fsdb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'museums', museumId, 'videos'), fs.orderBy('order')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Saves a converted video (videoTools.js) in < 1 MB pieces, then its details. */
export async function uploadVideo(museumId, processed, details, onProgress = () => {}) {
  const { db, fs } = await fsdb();
  const ref = fs.doc(fs.collection(db, 'museums', museumId, 'videos'));
  const chunks = Math.ceil(processed.bytes.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    const piece = processed.bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
    await fs.setDoc(fs.doc(db, 'museums', museumId, 'videochunks', `${ref.id}-${i}`), { data: fs.Bytes.fromUint8Array(piece) });
    onProgress(i + 1, chunks);
  }
  const data = {
    ...details,
    width: processed.width,
    height: processed.height,
    duration: processed.duration,
    size: processed.bytes.length,
    chunks,
    poster: fs.Bytes.fromUint8Array(processed.poster),
    createdAt: fs.serverTimestamp(),
  };
  await fs.setDoc(ref, data); // last, so visitors never see a half-uploaded video
  return { id: ref.id, ...data };
}

export async function updateVideo(museumId, videoId, patch) {
  const { db, fs } = await fsdb();
  await fs.updateDoc(fs.doc(db, 'museums', museumId, 'videos', videoId), patch);
}

export async function deleteVideo(museumId, video) {
  const { db, fs } = await fsdb();
  await fs.deleteDoc(fs.doc(db, 'museums', museumId, 'videos', video.id));
  for (let i = 0; i < video.chunks; i++) await fs.deleteDoc(fs.doc(db, 'museums', museumId, 'videochunks', `${video.id}-${i}`));
}
