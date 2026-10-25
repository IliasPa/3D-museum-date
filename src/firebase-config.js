/**
 * Firebase project settings.
 *
 * These values are public by design (every website using Firebase ships them);
 * what protects the photos are the security rules in firestore.rules and
 * database.rules.json, which run on Google's servers.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCz8hz37GOOqVnOqFlugw4hyac88LN58sk',
  authDomain: 'our-museum-iliaspa.firebaseapp.com',
  databaseURL: 'https://our-museum-iliaspa-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'our-museum-iliaspa',
  appId: '1:530227910980:web:985a49465c0fecad0e9f11',
};

/**
 * Who can open /admin. If you change this, change it in firestore.rules and
 * database.rules.json too, then run `npm run deploy:rules`.
 */
export const ADMIN_EMAILS = ['iliasparaskevas3@gmail.com'];
