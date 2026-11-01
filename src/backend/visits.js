/**
 * What guests write themselves (the rules only allow their own record):
 *
 *   Firestore  museums/{id}/visits/{email}   { at, tz, yes?, dodges? }
 *              when they last came in (the curator sees it), their time zone
 *              (only the region, e.g. "Europe/Athens" — for the clocks in the
 *              first room) and, after a proposal, when they said yes.
 *   Realtime   hunt/{museumId}/{keyId}       { by, t }
 *              the keys found so far — shared, so you hunt together.
 */
import { getFirestoreDb, getRealtimeDb } from './firebase.js';

/** This device's time zone, e.g. "Europe/Athens" (no location, just the region). */
export function myTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "I'm here": the visit time and time zone (guests only). */
export async function recordVisit(museumId, email) {
  const { db, fs } = await getFirestoreDb();
  await fs.setDoc(fs.doc(db, 'museums', museumId, 'visits', email.toLowerCase()), { at: fs.serverTimestamp(), tz: myTimeZone() }, { merge: true });
}

/** Everyone's visit records: Map email → { tz, at, yes, dodges }. */
export async function loadVisits(museumId) {
  const { db, fs } = await getFirestoreDb();
  const snap = await fs.getDocs(fs.collection(db, 'museums', museumId, 'visits'));
  return new Map(snap.docs.map((d) => [d.id, d.data()]));
}

/** The proposal was answered: YES (and how often "No" was chased). */
export async function saveYes(museumId, email, dodges) {
  const { db, fs } = await getFirestoreDb();
  await fs.setDoc(fs.doc(db, 'museums', museumId, 'visits', email.toLowerCase()), {
    at: fs.serverTimestamp(), tz: myTimeZone(), yes: fs.Timestamp.now(), dodges: Math.max(0, Math.round(dodges)),
  }, { merge: true });
}

/**
 * The key hunt's finds, live: calls `onChange(Map keyId → { by, t })` now and
 * whenever someone finds one, or `onRefused()` if the database won't share
 * them (its rules are older than this site: `npm run deploy:rules`).
 * Returns { found(keyId, name), stop() }.
 */
export async function joinHunt(museumId, onChange, onRefused = () => {}) {
  const { db, rt } = await getRealtimeDb();
  const ref = rt.ref(db, `hunt/${museumId}`);
  const off = rt.onValue(ref, (snap) => onChange(new Map(Object.entries(snap.val() ?? {}))), (err) => {
    console.warn('[hunt] the finds can’t be shared:', err.message);
    onRefused();
  });
  return {
    found: (keyId, name) => rt.set(rt.ref(db, `hunt/${museumId}/${keyId}`), { by: String(name).slice(0, 40), t: rt.serverTimestamp() })
      .catch((err) => console.warn('[hunt] could not save the find:', err.message)),
    stop: off,
  };
}
