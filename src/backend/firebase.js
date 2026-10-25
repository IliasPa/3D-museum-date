/**
 * Firebase setup + Google sign-in.
 *
 * Only Auth is loaded up front (it's small). The databases are loaded on
 * demand with getFirestoreDb() / getRealtimeDb(), so the sign-in page stays light.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut,
  onAuthStateChanged, connectAuthEmulator, signInWithCredential,
} from 'firebase/auth';
import { FIREBASE_CONFIG, ADMIN_EMAILS } from '../firebase-config.js';

/** `npm run dev:emulator` talks to local emulators instead of the real project. */
export const USING_EMULATORS = import.meta.env.VITE_EMULATORS === '1';
const EMULATOR_HOST = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';

const config = USING_EMULATORS
  ? { apiKey: 'demo-key', authDomain: 'demo-our-museum.firebaseapp.com', projectId: 'demo-our-museum', databaseURL: 'https://demo-our-museum-default-rtdb.firebaseio.com', appId: 'demo' }
  : FIREBASE_CONFIG;

export const isConfigured = USING_EMULATORS || !String(config.apiKey).includes('REPLACE_ME');

export const app = initializeApp(config);
export const auth = getAuth(app);
if (USING_EMULATORS) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Calls back with the signed-in user (or null) now and whenever it changes. */
export function watchUser(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    // Some browsers block pop-ups: fall back to a full-page redirect.
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth, provider);
    }
    throw err;
  }
}

export function signOutUser() {
  return signOut(auth);
}

/** A human explanation for a failed sign-in. */
export function signInErrorMessage(err) {
  switch (err?.code) {
    case 'auth/unauthorized-domain':
      return 'This web address isn’t allowed to sign in yet (Firebase → Authentication → Settings → Authorized domains).';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Google sign-in isn’t switched on yet (Firebase → Authentication → Sign-in method → Google).';
    case 'auth/network-request-failed':
      return 'No connection — check your internet and try again.';
    default:
      return 'Sign-in didn’t work. Please try again.';
  }
}

/** True inside Instagram/Facebook/TikTok… in-app browsers, where Google blocks sign-in. */
export function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Messenger|Line\/|TikTok|Snapchat|musical_ly|Twitter/i.test(navigator.userAgent);
}

// ── Databases (loaded on demand) ──────────────────────────────────────
let firestorePromise;
let realtimePromise;

export function getFirestoreDb() {
  firestorePromise ??= import('firebase/firestore').then((fs) => {
    let db;
    try {
      // Cache documents on the device, so photos load instantly on the next visit.
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager(), cacheSizeBytes: 250 * 1024 * 1024 }),
      });
    } catch {
      db = fs.getFirestore(app);
    }
    if (USING_EMULATORS) fs.connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    return { db, fs };
  });
  return firestorePromise;
}

export function getRealtimeDb() {
  realtimePromise ??= import('firebase/database').then((rt) => {
    const db = rt.getDatabase(app);
    if (USING_EMULATORS) rt.connectDatabaseEmulator(db, EMULATOR_HOST, 9000);
    return { db, rt };
  });
  return realtimePromise;
}

// Emulator-only helper for automated tests: sign in as any Google account.
if (USING_EMULATORS) {
  window.__testSignIn = (email, name = email.split('@')[0]) => signInWithCredential(
    auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: `test-${email}`, email, email_verified: true, name })),
  );
}
