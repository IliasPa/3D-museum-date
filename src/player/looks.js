/**
 * Avatar looks: everything a visitor can choose on the start screen.
 * A look is remembered on the device and sent (as a short code) to the other
 * visitor, so they see you exactly the way you dressed up.
 */
export const LOOK_OPTIONS = {
  body: ['guy', 'girl'],
  skin: ['#f8d9c4', '#f5cfb6', '#e8b58f', '#d39c72', '#b07650', '#7d4e33'],
  hairStyle: ['short', 'side', 'curly', 'buzz', 'long', 'bob', 'ponytail', 'pigtails', 'bun', 'bald'],
  hair: ['#2a1d18', '#4a3026', '#7a4a2a', '#b5763f', '#c4552b', '#e3c27a', '#efe6d2', '#8a8a8a', '#f29bb6', '#6f8fe0', '#9a6fd8'],
  eyes: ['#2a1f1d', '#5b3a24', '#3b6fb6', '#3f8f5a'],
  face: ['none', 'freckles', 'stubble', 'mustache', 'beard'],
  top: ['sweater', 'tshirt', 'hoodie', 'dress'],
  topColor: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#b48be0', '#f4f1ec', '#2f3542', '#e88f4f'],
  bottom: ['pants', 'shorts', 'skirt'],
  bottomColor: ['#3e4a6b', '#2b2b33', '#8a6a4a', '#c7c2b8', '#6f9fd8', '#d4708a'],
  shoes: ['#2b2b33', '#f4f1ec', '#b0473b', '#7a5236', '#6f9fd8'],
  hat: ['none', 'beanie', 'cap', 'bow', 'flowers', 'crown'],
  glasses: ['none', 'round', 'sunglasses', 'hearts'],
  extra: ['none', 'scarf', 'backpack', 'earrings', 'heart'],
};

/** Labels for the start screen (options without a label are colour swatches). */
export const LOOK_LABELS = {
  body: { guy: 'Guy', girl: 'Girl' },
  hairStyle: { short: 'Short', side: 'Side part', curly: 'Curly', buzz: 'Buzz', long: 'Long', bob: 'Bob', ponytail: 'Ponytail', pigtails: 'Pigtails', bun: 'Bun', bald: 'Bald' },
  face: { none: 'None', freckles: 'Freckles', stubble: 'Stubble', mustache: 'Moustache', beard: 'Beard' },
  top: { sweater: 'Sweater', tshirt: 'T-shirt', hoodie: 'Hoodie', dress: 'Dress' },
  bottom: { pants: 'Trousers', shorts: 'Shorts', skirt: 'Skirt' },
  hat: { none: 'None', beanie: 'Beanie', cap: 'Cap', bow: 'Bow', flowers: 'Flowers', crown: 'Crown' },
  glasses: { none: 'None', round: 'Round', sunglasses: 'Shades', hearts: 'Hearts' },
  extra: { none: 'None', scarf: 'Scarf', backpack: 'Backpack', earrings: 'Earrings', heart: 'Heart' },
};

/** The groups of the look picker, in order. */
export const LOOK_GROUPS = [
  { name: 'Body', fields: [['body', 'Body'], ['skin', 'Skin'], ['eyes', 'Eyes']] },
  { name: 'Hair', fields: [['hairStyle', 'Style'], ['hair', 'Colour'], ['face', 'Face']] },
  { name: 'Outfit', fields: [['top', 'Top'], ['topColor', 'Colour'], ['bottom', 'Bottom'], ['bottomColor', 'Colour'], ['shoes', 'Shoes']] },
  { name: 'Extras', fields: [['hat', 'Hat'], ['glasses', 'Glasses'], ['extra', 'Extra']] },
];

const FIELDS = Object.keys(LOOK_OPTIONS);
const STORAGE_KEY = 'museum-look-v2';

export function defaultLook() {
  return {
    body: 'guy', skin: LOOK_OPTIONS.skin[1], hairStyle: 'short', hair: LOOK_OPTIONS.hair[1], eyes: LOOK_OPTIONS.eyes[0],
    face: 'none', top: 'sweater', topColor: LOOK_OPTIONS.topColor[0], bottom: 'pants', bottomColor: LOOK_OPTIONS.bottomColor[0],
    shoes: LOOK_OPTIONS.shoes[0], hat: 'none', glasses: 'none', extra: 'heart',
  };
}

/** A fun random outfit (the 🎲 button). */
export function randomLook() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const look = Object.fromEntries(FIELDS.map((f) => [f, pick(LOOK_OPTIONS[f])]));
  // Keep it mostly sensible: fewer hats/glasses/beards than not.
  if (Math.random() < 0.5) look.hat = 'none';
  if (Math.random() < 0.6) look.glasses = 'none';
  if (look.body === 'girl' && Math.random() < 0.8) look.face = Math.random() < 0.5 ? 'freckles' : 'none';
  if (look.body === 'guy' && look.top === 'dress' && Math.random() < 0.7) look.top = 'sweater';
  return look;
}

/** Remembered look for this device (or the default). */
export function loadLook() {
  try {
    return decodeLook(localStorage.getItem(STORAGE_KEY)) ?? defaultLook();
  } catch {
    return defaultLook();
  }
}

export function saveLook(look) {
  try {
    localStorage.setItem(STORAGE_KEY, encodeLook(look));
  } catch {}
}

/** Compact code for the network: "2." + one index per field, e.g. "2.0.1.0.1.0.0.0.0.0.0.0.0.0.4". */
export function encodeLook(look) {
  return '2.' + FIELDS.map((f) => Math.max(0, LOOK_OPTIONS[f].indexOf(look[f]))).join('.');
}

export function decodeLook(code) {
  const text = String(code ?? '');
  if (text.startsWith('2.')) {
    const parts = text.slice(2).split('.').map(Number);
    if (parts.length !== FIELDS.length) return null;
    const look = {};
    FIELDS.forEach((f, i) => (look[f] = LOOK_OPTIONS[f][parts[i]] ?? LOOK_OPTIONS[f][0]));
    return look;
  }
  // Older "#shirt|#hair|#skin|style" codes (first version of the look picker).
  const [shirt, hair, skin, style] = text.split('|');
  if (!/^#[0-9a-f]{6}$/i.test(shirt ?? '')) return null;
  return { ...defaultLook(), topColor: shirt, hair, skin, hairStyle: LOOK_OPTIONS.hairStyle.includes(style) ? style : 'short' };
}
