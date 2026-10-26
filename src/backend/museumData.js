/**
 * Reading museums from the database (the visitor side; the curator's writing
 * side is in admin/store.js).
 *
 * Photos live in the database itself (the free Firebase plan has no file
 * storage): each photo has a small details document, and its pictures are
 * stored as bytes in museums/{id}/images/{photoId}-md and -lg.
 */
import { getFirestoreDb, isAdminEmail } from './firebase.js';

/** Museums this person may enter: [{ id, name, title }]. The curator sees all of them. */
export async function findMuseums(user) {
  const { db, fs } = await getFirestoreDb();
  const summary = (snap) => ({ id: snap.id, slug: snap.data().slug ?? '', name: snap.data().name || snap.data().title || 'Museum', title: snap.data().title });

  if (isAdminEmail(user.email)) {
    const snap = await fs.getDocs(fs.collection(db, 'museums'));
    return snap.docs.map(summary);
  }
  const access = await fs.getDoc(fs.doc(db, 'access', user.email.toLowerCase()));
  const ids = access.exists() ? access.data().museums ?? [] : [];
  const found = await Promise.all(ids.map(async (id) => {
    try {
      const snap = await fs.getDoc(fs.doc(db, 'museums', id));
      return snap.exists() ? summary(snap) : null;
    } catch {
      return null; // deleted, or no longer on the list
    }
  }));
  return found.filter(Boolean);
}

/** True if this email is on the museum's guest list (and so may walk around in it). */
export async function isGuestOf(user, museumId) {
  const { db, fs } = await getFirestoreDb();
  const access = await fs.getDoc(fs.doc(db, 'access', user.email.toLowerCase()));
  return access.exists() && (access.data().museums ?? []).includes(museumId);
}

/**
 * A museum's settings + its photos and videos (in walking order). Each photo
 * has a `url(size)` function: 'md' for the wall, 'lg' for full screen. Each
 * video has `posterUrl` (a promise) and `url()` (downloads the film).
 */
export async function loadMuseum(museumId) {
  const { db, fs } = await getFirestoreDb();
  const [museumSnap, photoSnap, videoSnap] = await Promise.all([
    fs.getDoc(fs.doc(db, 'museums', museumId)),
    fs.getDocs(fs.query(fs.collection(db, 'museums', museumId, 'photos'), fs.orderBy('order'))),
    fs.getDocs(fs.query(fs.collection(db, 'museums', museumId, 'videos'), fs.orderBy('order'))),
  ]);
  if (!museumSnap.exists()) throw new Error('This museum no longer exists.');
  const photos = photoSnap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      room: p.room ?? 1,
      slot: p.slot, // its spot on the walls (layout.js)
      title: p.title ?? '',
      date: p.date ?? '',
      caption: p.caption ?? '',
      width: p.width,
      height: p.height,
      color: p.color,
      url: (size) => imageUrl(museumId, d.id, size),
    };
  });
  const videos = videoSnap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      room: v.room ?? 1,
      title: v.title ?? '',
      caption: v.caption ?? '',
      width: v.width,
      height: v.height,
      duration: v.duration,
      posterUrl: Promise.resolve(v.poster ? URL.createObjectURL(new Blob([v.poster.toUint8Array()], { type: 'image/jpeg' })) : null),
      url: () => videoUrl(museumId, d.id, v),
    };
  });
  return { id: museumId, data: museumSnap.data(), photos, videos };
}

/** Object URL for a video (stored in < 1 MB pieces); downloaded once, then reused. */
export function videoUrl(museumId, videoId, video) {
  const key = `${museumId}/video/${videoId}`;
  if (!urls.has(key)) {
    const promise = Promise.all(
      Array.from({ length: video.chunks }, (_, i) => readBytes(`museums/${museumId}/videochunks/${videoId}-${i}`)),
    ).then((parts) => URL.createObjectURL(new Blob(parts, { type: 'video/mp4' })));
    promise.catch(() => urls.delete(key));
    urls.set(key, promise);
  }
  return urls.get(key);
}

const urls = new Map();

/** Object URL for a photo ('md' or 'lg'); downloaded once, then reused. */
export function imageUrl(museumId, photoId, size) {
  const key = `${museumId}/${photoId}-${size}`;
  if (!urls.has(key)) {
    const promise = readBytes(`museums/${museumId}/images/${photoId}-${size}`)
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
    promise.catch(() => urls.delete(key)); // allow a retry later
    urls.set(key, promise);
  }
  return urls.get(key);
}

/** The museum's own song as an object URL, or null to use the default song. */
export async function loadMusicUrl(museumId, music) {
  if (!music?.chunks) return null;
  const parts = await Promise.all(
    Array.from({ length: music.chunks }, (_, i) => readBytes(`museums/${museumId}/music/${music.version}-${i}`)),
  );
  return URL.createObjectURL(new Blob(parts, { type: music.type || 'audio/mpeg' }));
}

/**
 * Bytes stored in a document's `data` field. Photos and songs never change
 * once uploaded (new uploads get new ids), so the on-device cache is tried
 * first — repeat visits load instantly and cost nothing.
 */
async function readBytes(path) {
  const { db, fs } = await getFirestoreDb();
  const ref = fs.doc(db, path);
  let snap = null;
  try {
    snap = await fs.getDocFromCache(ref);
  } catch {
    // not cached yet
  }
  if (!snap?.exists()) snap = await fs.getDoc(ref);
  if (!snap.exists()) throw new Error(`missing ${path}`);
  return snap.data().data.toUint8Array();
}
