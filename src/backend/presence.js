/**
 * Live avatars ("presence"). Each visitor writes their position to the
 * Realtime Database at presence/{museumId}/{uid} — about 10× per second while
 * moving, every few seconds while standing still — and listens to everyone
 * else's. When the tab closes, Firebase removes the entry automatically.
 */
import { getRealtimeDb } from './firebase.js';

const SEND_EVERY_MS = 100;
const HEARTBEAT_MS = 4000;
const STALE_MS = 30000; // forget people we haven't heard from in 30 s

/**
 * @param museumId
 * @param user      Firebase user
 * @param name      shown above your avatar
 * @param look      encoded look string (looks.js)
 * @param publish   false = watch only (e.g. the curator peeking in)
 * @param getState  () => { x, z, f, s, a, an, at } — your avatar right now (+ its action)
 * @param onPeople  (Map uid → state) — everyone else, whenever it changes
 */
export async function joinPresence({ museumId, user, name, look, publish, getState, onPeople }) {
  const { db, rt } = await getRealtimeDb();
  const roomRef = rt.ref(db, `presence/${museumId}`);
  const meRef = rt.ref(db, `presence/${museumId}/${user.uid}`);
  const people = new Map();
  let serverOffset = 0;

  rt.onValue(rt.ref(db, '.info/serverTimeOffset'), (snap) => (serverOffset = snap.val() || 0));

  const emit = () => {
    const now = Date.now() + serverOffset;
    const others = new Map();
    for (const [uid, state] of people) {
      if (uid !== user.uid && now - (state.t ?? 0) < STALE_MS) others.set(uid, state);
    }
    onPeople(others);
  };
  const put = (snap) => {
    people.set(snap.key, snap.val());
    emit();
  };
  const unsubs = [
    rt.onChildAdded(roomRef, put, (err) => console.warn('[presence]', err.message)),
    rt.onChildChanged(roomRef, put),
    rt.onChildRemoved(roomRef, (snap) => {
      people.delete(snap.key);
      emit();
    }),
  ];
  const staleTimer = setInterval(emit, 5000);

  let sendTimer;
  let last = null;
  let lastSent = 0;
  let emote = 0;
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  if (publish) {
    rt.onDisconnect(meRef).remove();
    const send = () => {
      const s = getState();
      const now = Date.now();
      const changed = !last || Math.hypot(s.x - last.x, s.z - last.z) > 0.02 || Math.abs(s.f - last.f) > 0.03 ||
        Math.abs(s.s - last.s) > 0.04 || s.an !== last.an || s.a !== last.a;
      if (!changed && now - lastSent < HEARTBEAT_MS) return;
      last = s;
      lastSent = now;
      const data = {
        name, look, x: round(s.x), z: round(s.z), f: round(s.f, 3), s: round(s.s),
        a: s.a ?? '', an: s.an ?? 0, at: s.at ?? '', t: rt.serverTimestamp(),
      };
      if (emote) data.e = emote;
      rt.set(meRef, data).catch((err) => console.warn('[presence] could not send position:', err.message));
    };
    send();
    sendTimer = setInterval(send, SEND_EVERY_MS);
  }

  return {
    /** Tell everyone you pressed ♥. */
    emote() {
      emote = Date.now();
      last = null; // send right away
    },
    leave() {
      clearInterval(sendTimer);
      clearInterval(staleTimer);
      unsubs.forEach((off) => off());
      if (publish) rt.remove(meRef).catch(() => {});
    },
  };
}
