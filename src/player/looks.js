/**
 * Avatar looks: everything a visitor can choose on the start screen.
 * A look is remembered on the device and sent (as a short code) to the other
 * visitor, so they see you exactly the way you dressed up.
 */
export const LOOK_OPTIONS = {
  body: ['guy', 'girl'],
  build: ['regular', 'slim', 'cuddly'],
  skin: ['#fde4d3', '#f8d9c4', '#f5cfb6', '#e8b58f', '#d39c72', '#b07650', '#7d4e33', '#5c3a26'],
  eyeShape: ['round', 'lashes', 'sparkly', 'sleepy', 'happy'],
  eyes: ['#2a1f1d', '#5b3a24', '#3b6fb6', '#3f8f5a', '#6b7b8a', '#8a5bb8'],
  brows: ['natural', 'thick', 'thin', 'none'],
  mouth: ['smile', 'grin', 'cat', 'small'],
  cheeks: ['rosy', 'hearts', 'none'],
  face: ['none', 'freckles', 'stubble', 'mustache', 'beard'],
  hairStyle: ['short', 'side', 'curly', 'spiky', 'buzz', 'mohawk', 'afro', 'long', 'bob', 'ponytail', 'pigtails', 'braids', 'bun', 'bald'],
  hair: ['#2a1d18', '#4a3026', '#7a4a2a', '#b5763f', '#c4552b', '#e3c27a', '#efe6d2', '#8a8a8a', '#f29bb6', '#6f8fe0', '#9a6fd8', '#3fae9a'],
  top: ['sweater', 'tshirt', 'hoodie', 'shirt', 'jacket', 'dress'],
  pattern: ['plain', 'heart', 'star', 'stripes', 'dots'],
  topColor: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#b48be0', '#f4f1ec', '#2f3542', '#e88f4f', '#9fd3e6', '#c8a2c8', '#556b2f', '#8e1530'],
  bottom: ['pants', 'shorts', 'skirt'],
  bottomColor: ['#3e4a6b', '#2b2b33', '#8a6a4a', '#c7c2b8', '#6f9fd8', '#d4708a', '#5a7d5a', '#f4f1ec'],
  shoeStyle: ['sneakers', 'boots'],
  shoes: ['#2b2b33', '#f4f1ec', '#b0473b', '#7a5236', '#6f9fd8', '#f29bb6'],
  hat: ['none', 'beanie', 'cap', 'beret', 'sunhat', 'bow', 'bunny', 'cat', 'flowers', 'crown'],
  hatColor: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#f4f1ec', '#2f3542', '#ff6f91', '#c8a2c8'],
  glasses: ['none', 'round', 'square', 'sunglasses', 'hearts', 'stars'],
  neck: ['none', 'scarf', 'necklace', 'bowtie', 'tie'],
  back: ['none', 'backpack', 'wings', 'cape'],
  ears: ['none', 'earrings', 'headphones'],
  hold: ['none', 'balloon'],
};

/** Labels for the start screen (options without a label are colour swatches). */
export const LOOK_LABELS = {
  body: { guy: 'Guy', girl: 'Girl' },
  build: { regular: 'Regular', slim: 'Slim', cuddly: 'Cuddly' },
  eyeShape: { round: 'Round', lashes: 'Lashes', sparkly: 'Sparkly', sleepy: 'Sleepy', happy: 'Happy ^^' },
  brows: { natural: 'Natural', thick: 'Thick', thin: 'Thin', none: 'None' },
  mouth: { smile: 'Smile', grin: 'Grin', cat: 'Cat :3', small: 'Small' },
  cheeks: { rosy: 'Rosy', hearts: 'Hearts', none: 'None' },
  face: { none: 'None', freckles: 'Freckles', stubble: 'Stubble', mustache: 'Moustache', beard: 'Beard' },
  hairStyle: {
    short: 'Short', side: 'Side part', curly: 'Curly', spiky: 'Spiky', buzz: 'Buzz', mohawk: 'Mohawk', afro: 'Afro', long: 'Long',
    bob: 'Bob', ponytail: 'Ponytail', pigtails: 'Pigtails', braids: 'Braids', bun: 'Bun', bald: 'Bald',
  },
  top: { sweater: 'Sweater', tshirt: 'T-shirt', hoodie: 'Hoodie', shirt: 'Shirt', jacket: 'Jacket', dress: 'Dress' },
  pattern: { plain: 'Plain', heart: 'Heart', star: 'Star', stripes: 'Stripes', dots: 'Dots' },
  bottom: { pants: 'Trousers', shorts: 'Shorts', skirt: 'Skirt' },
  shoeStyle: { sneakers: 'Sneakers', boots: 'Boots' },
  hat: { none: 'None', beanie: 'Beanie', cap: 'Cap', beret: 'Beret', sunhat: 'Sun hat', bow: 'Bow', bunny: 'Bunny ears', cat: 'Cat ears', flowers: 'Flowers', crown: 'Crown' },
  glasses: { none: 'None', round: 'Round', square: 'Square', sunglasses: 'Shades', hearts: 'Hearts', stars: 'Stars' },
  neck: { none: 'None', scarf: 'Scarf', necklace: 'Necklace', bowtie: 'Bow tie', tie: 'Tie' },
  back: { none: 'None', backpack: 'Backpack', wings: 'Wings', cape: 'Cape' },
  ears: { none: 'None', earrings: 'Earrings', headphones: 'Headphones' },
  hold: { none: 'None', balloon: 'Heart balloon' },
};

/** The tabs of the look picker, in order. */
export const LOOK_GROUPS = [
  { name: 'Body', fields: [['body', 'Body'], ['build', 'Build'], ['skin', 'Skin']] },
  { name: 'Face', fields: [['eyeShape', 'Eyes'], ['eyes', 'Colour'], ['brows', 'Brows'], ['mouth', 'Mouth'], ['cheeks', 'Cheeks'], ['face', 'Extra']] },
  { name: 'Hair', fields: [['hairStyle', 'Style'], ['hair', 'Colour']] },
  { name: 'Top', fields: [['top', 'Top'], ['pattern', 'Print'], ['topColor', 'Colour']] },
  { name: 'Bottom', fields: [['bottom', 'Bottom'], ['bottomColor', 'Colour'], ['shoeStyle', 'Shoes'], ['shoes', 'Colour']] },
  { name: 'Hats', fields: [['hat', 'Hat'], ['hatColor', 'Colour'], ['glasses', 'Glasses']] },
  { name: 'Extras', fields: [['neck', 'Neck'], ['back', 'Back'], ['ears', 'Ears'], ['hold', 'Hand']] },
];

const FIELDS = Object.keys(LOOK_OPTIONS);
const STORAGE_KEY = 'museum-look-v2';

export function defaultLook() {
  return {
    body: 'guy', build: 'regular', skin: LOOK_OPTIONS.skin[2], eyeShape: 'round', eyes: LOOK_OPTIONS.eyes[0], brows: 'natural',
    mouth: 'smile', cheeks: 'rosy', face: 'none', hairStyle: 'short', hair: LOOK_OPTIONS.hair[1],
    top: 'sweater', pattern: 'heart', topColor: LOOK_OPTIONS.topColor[0], bottom: 'pants', bottomColor: LOOK_OPTIONS.bottomColor[0],
    shoeStyle: 'sneakers', shoes: LOOK_OPTIONS.shoes[0], hat: 'none', hatColor: LOOK_OPTIONS.hatColor[0], glasses: 'none',
    neck: 'none', back: 'none', ears: 'none', hold: 'none',
  };
}

/** A fun random outfit (the 🎲 button). */
export function randomLook() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const look = Object.fromEntries(FIELDS.map((f) => [f, pick(LOOK_OPTIONS[f])]));
  // Keep it mostly sensible: fewer hats, glasses, beards and gadgets than not.
  for (const [field, chance] of [['hat', 0.5], ['glasses', 0.6], ['neck', 0.6], ['back', 0.7], ['ears', 0.6], ['hold', 0.8]]) {
    if (Math.random() < chance) look[field] = 'none';
  }
  if (look.body === 'girl' && Math.random() < 0.8) look.face = Math.random() < 0.5 ? 'freckles' : 'none';
  if (look.body === 'girl' && Math.random() < 0.6) look.eyeShape = 'lashes';
  if (look.body === 'guy' && look.top === 'dress' && Math.random() < 0.7) look.top = 'sweater';
  if (Math.random() < 0.6) look.brows = 'natural';
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

/** Compact code for the network: "3." + one index per field, e.g. "3.0.0.2.0.0.0…" (≈ 60 characters). */
export function encodeLook(look) {
  return '3.' + FIELDS.map((f) => Math.max(0, LOOK_OPTIONS[f].indexOf(look[f]))).join('.');
}

// The fields and options of the second version of the picker, to read older codes.
const V2 = {
  body: ['guy', 'girl'],
  skin: ['#f8d9c4', '#f5cfb6', '#e8b58f', '#d39c72', '#b07650', '#7d4e33'],
  hairStyle: ['short', 'side', 'curly', 'buzz', 'long', 'bob', 'ponytail', 'pigtails', 'bun', 'bald'],
  hair: LOOK_OPTIONS.hair.slice(0, 11),
  eyes: LOOK_OPTIONS.eyes.slice(0, 4),
  face: LOOK_OPTIONS.face,
  top: ['sweater', 'tshirt', 'hoodie', 'dress'],
  topColor: LOOK_OPTIONS.topColor.slice(0, 8),
  bottom: LOOK_OPTIONS.bottom,
  bottomColor: LOOK_OPTIONS.bottomColor.slice(0, 6),
  shoes: LOOK_OPTIONS.shoes.slice(0, 5),
  hat: ['none', 'beanie', 'cap', 'bow', 'flowers', 'crown'],
  glasses: ['none', 'round', 'sunglasses', 'hearts'],
  extra: ['none', 'scarf', 'backpack', 'earrings', 'heart'],
};

export function decodeLook(code) {
  const text = String(code ?? '');
  const read = (fields, prefix) => {
    const parts = text.slice(prefix.length).split('.').map(Number);
    const names = Object.keys(fields);
    if (parts.length !== names.length) return null;
    return Object.fromEntries(names.map((f, i) => [f, fields[f][parts[i]] ?? fields[f][0]]));
  };
  if (text.startsWith('3.')) return read(LOOK_OPTIONS, '3.');
  if (text.startsWith('2.')) {
    const old = read(V2, '2.');
    if (!old) return null;
    // One "extra" became separate neck / back / ears slots and the shirt print; girls had lashes.
    const { extra, ...rest } = old;
    return {
      ...defaultLook(),
      ...rest,
      pattern: extra === 'heart' ? 'heart' : 'plain',
      neck: extra === 'scarf' ? 'scarf' : 'none',
      back: extra === 'backpack' ? 'backpack' : 'none',
      ears: extra === 'earrings' ? 'earrings' : 'none',
      eyeShape: old.body === 'girl' ? 'lashes' : 'round',
      hatColor: old.topColor,
    };
  }
  // Older "#shirt|#hair|#skin|style" codes (first version of the look picker).
  const [shirt, hair, skin, style] = text.split('|');
  if (!/^#[0-9a-f]{6}$/i.test(shirt ?? '')) return null;
  return { ...defaultLook(), topColor: shirt, hair, skin, hairStyle: LOOK_OPTIONS.hairStyle.includes(style) ? style : 'short' };
}
