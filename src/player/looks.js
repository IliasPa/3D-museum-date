/**
 * Avatar looks: everything a visitor can choose in the avatar studio.
 * A look is remembered on the device and sent (as a short code) to the other
 * visitor, so they see you exactly the way you dressed up.
 *
 * Colours: every colour setting offers a few swatches, but any colour can be
 * picked ("custom"), so those values are simply "#rrggbb".
 */
export const LOOK_OPTIONS = {
  // Body
  body: ['guy', 'girl'],
  build: ['regular', 'slim', 'cuddly', 'strong'],
  height: [0.88, 0.94, 1, 1.06, 1.12],
  headSize: [0.9, 0.95, 1, 1.06, 1.12],
  skin: ['#fde4d3', '#f8d9c4', '#f5cfb6', '#e8b58f', '#d39c72', '#b07650', '#7d4e33', '#5c3a26', '#bfe3cf', '#cfc4ef', '#bcd8f2', '#f6c3d5'],
  // Face
  eyeShape: ['round', 'lashes', 'sparkly', 'sleepy', 'happy', 'dots', 'anime', 'hearts', 'cat'],
  eyes: ['#2a1f1d', '#5b3a24', '#3b6fb6', '#3f8f5a', '#6b7b8a', '#8a5bb8', '#c24f86', '#c9962b'],
  brows: ['natural', 'thick', 'thin', 'none', 'arched', 'angled'],
  mouth: ['smile', 'grin', 'cat', 'small', 'tongue', 'fangs', 'smirk', 'oh'],
  lips: ['none', '#d4506a', '#b0283c', '#e8737f', '#8e1530', '#c98a7a', '#7a3b5e'],
  cheeks: ['rosy', 'hearts', 'none', 'stars'],
  nose: ['button', 'round', 'pointy', 'tiny'],
  earShape: ['round', 'pointy', 'big'],
  beard: ['none', 'stubble', 'mustache', 'beard', 'goatee', 'handlebar'],
  marks: ['none', 'freckles', 'mole', 'bandaid', 'heart', 'glitter'],
  // Hair
  hairStyle: [
    'short', 'side', 'curly', 'spiky', 'buzz', 'mohawk', 'afro', 'long', 'bob', 'ponytail', 'pigtails', 'braids', 'bun', 'bald',
    'quiff', 'curtains', 'pixie', 'wavy', 'spacebuns', 'sidepony', 'topknot', 'dreads',
  ],
  hair: ['#2a1d18', '#4a3026', '#7a4a2a', '#b5763f', '#c4552b', '#e3c27a', '#efe6d2', '#8a8a8a', '#f29bb6', '#6f8fe0', '#9a6fd8', '#3fae9a'],
  dye: ['none', '#f29bb6', '#ff5c8a', '#6f8fe0', '#9a6fd8', '#3fae9a', '#e3c27a', '#efe6d2'],
  // Top
  top: ['sweater', 'tshirt', 'hoodie', 'shirt', 'jacket', 'dress', 'tank', 'turtleneck', 'overalls', 'blazer', 'puffer', 'jersey', 'cardigan'],
  pattern: ['plain', 'heart', 'star', 'stripes', 'dots', 'checks', 'flowers', 'zigzag', 'rainbow'],
  topColor: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#b48be0', '#f4f1ec', '#2f3542', '#e88f4f', '#9fd3e6', '#c8a2c8', '#556b2f', '#8e1530'],
  accent: ['#fff4f2', '#2b2b33', '#e0b84c', '#ff9eb5', '#e8737f', '#6f9fd8', '#7cc49a', '#f2b84b'],
  // Bottom
  bottom: ['pants', 'shorts', 'skirt', 'jeans', 'longskirt', 'cargo'],
  bottomColor: ['#3e4a6b', '#2b2b33', '#8a6a4a', '#c7c2b8', '#6f9fd8', '#d4708a', '#5a7d5a', '#f4f1ec', '#4a6fa5', '#b48be0'],
  shoeStyle: ['sneakers', 'boots', 'hightops', 'sandals', 'heels', 'slippers'],
  shoes: ['#2b2b33', '#f4f1ec', '#b0473b', '#7a5236', '#6f9fd8', '#f29bb6', '#f2b84b', '#7cc49a'],
  // Hats & glasses
  hat: [
    'none', 'beanie', 'cap', 'beret', 'sunhat', 'bow', 'bunny', 'cat', 'flowers', 'crown',
    'tophat', 'cowboy', 'party', 'halo', 'headband', 'tiara', 'witch', 'santa', 'bucket', 'horns', 'bear', 'chef',
  ],
  hatColor: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#f4f1ec', '#2f3542', '#ff6f91', '#c8a2c8', '#c0392b', '#8a6a4a'],
  glasses: ['none', 'round', 'square', 'sunglasses', 'hearts', 'stars', 'aviator', 'cateye', 'nerd', 'monocle'],
  // Extras
  neck: ['none', 'scarf', 'necklace', 'bowtie', 'tie', 'pearls', 'choker', 'bandana', 'lei', 'medal'],
  ears: ['none', 'earrings', 'headphones', 'hoops', 'pearls', 'earmuffs'],
  back: ['none', 'backpack', 'wings', 'cape', 'fairy', 'bat', 'guitar'],
  tail: ['none', 'cat', 'fox', 'bunny', 'devil'],
  hold: ['none', 'balloon', 'rose', 'teddy', 'icecream', 'coffee', 'bouquet', 'book', 'lollipop'],
  extraColor: ['#c0392b', '#2f3542', '#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#b48be0', '#f4f1ec', '#d98a3d'],
  // Pet
  pet: ['none', 'cat', 'dog', 'bunny', 'duck', 'bear'],
  petColor: ['#f2b84b', '#f4f1ec', '#2b2b33', '#8a6a4a', '#b8b8b8', '#e8c99b', '#f29bb6', '#d98a3d'],
};

/** Settings whose values are colours (a few swatches + any custom colour). */
export const COLOR_FIELDS = new Set(['skin', 'eyes', 'lips', 'hair', 'dye', 'topColor', 'accent', 'bottomColor', 'shoes', 'hatColor', 'extraColor', 'petColor']);
/** Settings shown as a slider (small … big). */
export const SLIDER_FIELDS = { height: ['Short', 'Tall'], headSize: ['Small', 'Big'] };

/** Labels for the studio's tiles (colours and sliders have none). */
export const LOOK_LABELS = {
  body: { guy: 'Guy', girl: 'Girl' },
  build: { regular: 'Regular', slim: 'Slim', cuddly: 'Cuddly', strong: 'Strong' },
  eyeShape: { round: 'Round', lashes: 'Lashes', sparkly: 'Sparkly', sleepy: 'Sleepy', happy: 'Happy', dots: 'Dots', anime: 'Big', hearts: 'Hearts', cat: 'Cat' },
  brows: { natural: 'Natural', thick: 'Thick', thin: 'Thin', none: 'None', arched: 'Arched', angled: 'Bold' },
  mouth: { smile: 'Smile', grin: 'Grin', cat: 'Cat :3', small: 'Small', tongue: 'Tongue', fangs: 'Fangs', smirk: 'Smirk', oh: 'Oh!' },
  cheeks: { rosy: 'Rosy', hearts: 'Hearts', none: 'None', stars: 'Stars' },
  nose: { button: 'Button', round: 'Round', pointy: 'Pointy', tiny: 'Tiny' },
  earShape: { round: 'Round', pointy: 'Elf', big: 'Big' },
  beard: { none: 'None', stubble: 'Stubble', mustache: 'Moustache', beard: 'Beard', goatee: 'Goatee', handlebar: 'Curly tache' },
  marks: { none: 'None', freckles: 'Freckles', mole: 'Beauty spot', bandaid: 'Plaster', heart: 'Heart', glitter: 'Glitter' },
  hairStyle: {
    short: 'Short', side: 'Side part', curly: 'Curly', spiky: 'Spiky', buzz: 'Buzz', mohawk: 'Mohawk', afro: 'Afro', long: 'Long',
    bob: 'Bob', ponytail: 'Ponytail', pigtails: 'Pigtails', braids: 'Braids', bun: 'Bun', bald: 'Bald',
    quiff: 'Quiff', curtains: 'Curtains', pixie: 'Pixie', wavy: 'Wavy', spacebuns: 'Space buns', sidepony: 'Side pony', topknot: 'Top knot', dreads: 'Locs',
  },
  top: {
    sweater: 'Sweater', tshirt: 'T-shirt', hoodie: 'Hoodie', shirt: 'Shirt', jacket: 'Jacket', dress: 'Dress', tank: 'Tank top',
    turtleneck: 'Turtleneck', overalls: 'Dungarees', blazer: 'Blazer', puffer: 'Puffer', jersey: 'Jersey', cardigan: 'Cardigan',
  },
  pattern: { plain: 'Plain', heart: 'Heart', star: 'Star', stripes: 'Stripes', dots: 'Dots', checks: 'Checks', flowers: 'Flowers', zigzag: 'Zigzag', rainbow: 'Rainbow' },
  bottom: { pants: 'Trousers', shorts: 'Shorts', skirt: 'Skirt', jeans: 'Jeans', longskirt: 'Long skirt', cargo: 'Cargo' },
  shoeStyle: { sneakers: 'Sneakers', boots: 'Boots', hightops: 'High-tops', sandals: 'Sandals', heels: 'Heels', slippers: 'Bunny slippers' },
  hat: {
    none: 'None', beanie: 'Beanie', cap: 'Cap', beret: 'Beret', sunhat: 'Sun hat', bow: 'Bow', bunny: 'Bunny ears', cat: 'Cat ears', flowers: 'Flowers', crown: 'Crown',
    tophat: 'Top hat', cowboy: 'Cowboy', party: 'Party hat', halo: 'Halo', headband: 'Headband', tiara: 'Tiara', witch: 'Witch', santa: 'Santa',
    bucket: 'Bucket hat', horns: 'Horns', bear: 'Bear ears', chef: 'Chef',
  },
  glasses: { none: 'None', round: 'Round', square: 'Square', sunglasses: 'Shades', hearts: 'Hearts', stars: 'Stars', aviator: 'Aviators', cateye: 'Cat-eye', nerd: 'Bold', monocle: 'Monocle' },
  neck: { none: 'None', scarf: 'Scarf', necklace: 'Necklace', bowtie: 'Bow tie', tie: 'Tie', pearls: 'Pearls', choker: 'Locket', bandana: 'Bandana', lei: 'Flower lei', medal: 'Medal' },
  ears: { none: 'None', earrings: 'Studs', headphones: 'Headphones', hoops: 'Hoops', pearls: 'Pearls', earmuffs: 'Earmuffs' },
  back: { none: 'None', backpack: 'Backpack', wings: 'Angel wings', cape: 'Cape', fairy: 'Fairy wings', bat: 'Bat wings', guitar: 'Guitar' },
  tail: { none: 'None', cat: 'Cat', fox: 'Fox', bunny: 'Bunny', devil: 'Devil' },
  hold: { none: 'None', balloon: 'Balloon', rose: 'Rose', teddy: 'Teddy', icecream: 'Ice cream', coffee: 'Coffee', bouquet: 'Bouquet', book: 'Book', lollipop: 'Lollipop' },
  pet: { none: 'None', cat: 'Cat', dog: 'Puppy', bunny: 'Bunny', duck: 'Duckling', bear: 'Bear cub' },
};

/**
 * The studio's tabs, in order. `view` = what the big preview zooms in on;
 * each field's `shot` = how its little picture tiles are framed.
 */
export const LOOK_GROUPS = [
  { name: 'Body', icon: '🧍', view: 'full', fields: [['body', 'Body', 'full'], ['build', 'Build', 'full'], ['height', 'Height'], ['headSize', 'Head'], ['skin', 'Skin']] },
  {
    name: 'Face', icon: '🙂', view: 'head', fields: [
      ['eyeShape', 'Eyes', 'face'], ['eyes', 'Eye colour'], ['brows', 'Brows', 'face'], ['mouth', 'Mouth', 'face'], ['lips', 'Lipstick'],
      ['cheeks', 'Cheeks', 'face'], ['nose', 'Nose', 'side'], ['earShape', 'Ears', 'side'], ['beard', 'Beard', 'face'], ['marks', 'Details', 'face'],
    ],
  },
  { name: 'Hair', icon: '💇', view: 'head', fields: [['hairStyle', 'Style', 'head'], ['hair', 'Colour'], ['dye', 'Highlights']] },
  { name: 'Top', icon: '👕', view: 'torso', fields: [['top', 'Top', 'torso'], ['pattern', 'Print', 'torso'], ['topColor', 'Colour'], ['accent', 'Print colour']] },
  { name: 'Bottom', icon: '👖', view: 'legs', fields: [['bottom', 'Bottom', 'legs'], ['bottomColor', 'Colour'], ['shoeStyle', 'Shoes', 'feet'], ['shoes', 'Shoe colour']] },
  { name: 'Hats', icon: '🎩', view: 'head', fields: [['hat', 'Hat', 'head'], ['hatColor', 'Colour'], ['glasses', 'Glasses', 'face']] },
  {
    name: 'Extras', icon: '🎀', view: 'full', fields: [
      ['neck', 'Neck', 'neck'], ['ears', 'Ears', 'side'], ['back', 'Back', 'back'], ['tail', 'Tail', 'back'], ['hold', 'In hand', 'hand'], ['extraColor', 'Colour'],
    ],
  },
  { name: 'Pet', icon: '🐾', view: 'pet', fields: [['pet', 'Pet', 'pet'], ['petColor', 'Colour']] },
];

const FIELDS = Object.keys(LOOK_OPTIONS);
const STORAGE_KEY = 'museum-look-v2';

export function defaultLook() {
  const look = Object.fromEntries(FIELDS.map((f) => [f, LOOK_OPTIONS[f][0]]));
  return {
    ...look,
    height: 1, headSize: 1, skin: LOOK_OPTIONS.skin[2], hair: LOOK_OPTIONS.hair[1], pattern: 'heart',
  };
}

/** A fun random outfit (the 🎲 button). */
export function randomLook() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const look = Object.fromEntries(FIELDS.map((f) => [f, pick(LOOK_OPTIONS[f])]));
  // Keep it mostly sensible: fewer hats, glasses, beards and gadgets than not.
  const rarely = [['hat', 0.5], ['glasses', 0.6], ['neck', 0.6], ['back', 0.75], ['tail', 0.85], ['ears', 0.6], ['hold', 0.75], ['pet', 0.6],
    ['lips', 0.6], ['dye', 0.75], ['marks', 0.6], ['beard', 0.6]];
  for (const [field, chance] of rarely) if (Math.random() < chance) look[field] = LOOK_OPTIONS[field][0];
  if (look.body === 'girl') look.beard = 'none';
  if (look.body === 'girl' && Math.random() < 0.6) look.eyeShape = 'lashes';
  if (look.body === 'guy' && look.top === 'dress' && Math.random() < 0.7) look.top = 'sweater';
  if (look.body === 'guy' && Math.random() < 0.8) look.lips = 'none';
  if (Math.random() < 0.7) look.skin = pick(LOOK_OPTIONS.skin.slice(0, 8)); // the fantasy skins now and then
  if (Math.random() < 0.6) look.brows = 'natural';
  if (Math.random() < 0.5) look.height = look.headSize = 1;
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

// ── The look code ───────────────────────────────────────────────────────
// "4:" + one character per setting (its option number), in LOOK_OPTIONS
// order; a custom colour is "~" + 4 characters. At most ≈ 90 characters.
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

export function encodeLook(look) {
  let code = '4:';
  for (const f of FIELDS) {
    const i = LOOK_OPTIONS[f].indexOf(look[f]);
    if (i >= 0) code += DIGITS[i];
    else if (COLOR_FIELDS.has(f) && /^#[0-9a-f]{6}$/i.test(look[f] ?? '')) {
      const n = parseInt(look[f].slice(1), 16);
      code += '~' + [18, 12, 6, 0].map((shift) => DIGITS[(n >> shift) & 63]).join('');
    } else code += '0';
  }
  return code;
}

function decodeV4(text) {
  const look = defaultLook();
  let at = 2;
  for (const f of FIELDS) {
    if (at >= text.length) break; // a shorter (older) code: the rest stays default
    if (text[at] === '~') {
      const digits = text.slice(at + 1, at + 5);
      if (digits.length < 4 || [...digits].some((d) => !DIGITS.includes(d))) return null;
      const n = [...digits].reduce((sum, d) => sum * 64 + DIGITS.indexOf(d), 0);
      if (COLOR_FIELDS.has(f)) look[f] = `#${n.toString(16).padStart(6, '0')}`;
      at += 5;
    } else {
      const option = LOOK_OPTIONS[f][DIGITS.indexOf(text[at])];
      if (option !== undefined) look[f] = option;
      at += 1;
    }
  }
  return look;
}

// The settings of the third version of the picker (its lists were only added
// to since, except "face", which became "beard" + "marks").
const V3_FIELDS = [
  'body', 'build', 'skin', 'eyeShape', 'eyes', 'brows', 'mouth', 'cheeks', 'face', 'hairStyle', 'hair', 'top', 'pattern', 'topColor',
  'bottom', 'bottomColor', 'shoeStyle', 'shoes', 'hat', 'hatColor', 'glasses', 'neck', 'back', 'ears', 'hold',
];
const V3_FACE = ['none', 'freckles', 'stubble', 'mustache', 'beard'];

// The second version, to read even older codes.
const V2 = {
  body: ['guy', 'girl'],
  skin: ['#f8d9c4', '#f5cfb6', '#e8b58f', '#d39c72', '#b07650', '#7d4e33'],
  hairStyle: ['short', 'side', 'curly', 'buzz', 'long', 'bob', 'ponytail', 'pigtails', 'bun', 'bald'],
  hair: LOOK_OPTIONS.hair.slice(0, 11),
  eyes: LOOK_OPTIONS.eyes.slice(0, 4),
  face: V3_FACE,
  top: ['sweater', 'tshirt', 'hoodie', 'dress'],
  topColor: LOOK_OPTIONS.topColor.slice(0, 8),
  bottom: LOOK_OPTIONS.bottom.slice(0, 3),
  bottomColor: LOOK_OPTIONS.bottomColor.slice(0, 6),
  shoes: LOOK_OPTIONS.shoes.slice(0, 5),
  hat: ['none', 'beanie', 'cap', 'bow', 'flowers', 'crown'],
  glasses: ['none', 'round', 'sunglasses', 'hearts'],
  extra: ['none', 'scarf', 'backpack', 'earrings', 'heart'],
};

/** "face" of the older versions → beard + marks. */
function splitFace(face) {
  return { beard: ['stubble', 'mustache', 'beard'].includes(face) ? face : 'none', marks: face === 'freckles' ? 'freckles' : 'none' };
}

/** The colours scarves, ties and backpacks had before they could be chosen. */
function oldExtraColor({ neck, back }) {
  if (back === 'backpack') return '#d98a3d';
  return neck === 'tie' ? '#2f3542' : LOOK_OPTIONS.extraColor[0];
}

export function decodeLook(code) {
  const text = String(code ?? '');
  if (text.startsWith('4:')) return decodeV4(text);
  if (text.startsWith('3.')) {
    const parts = text.slice(2).split('.').map(Number);
    if (parts.length !== V3_FIELDS.length) return null;
    const old = Object.fromEntries(V3_FIELDS.map((f, i) => {
      const list = f === 'face' ? V3_FACE : LOOK_OPTIONS[f];
      return [f, list[parts[i]] ?? list[0]];
    }));
    const { face, ...rest } = old;
    return { ...defaultLook(), ...rest, ...splitFace(face), extraColor: oldExtraColor(rest) };
  }
  if (text.startsWith('2.')) {
    const parts = text.slice(2).split('.').map(Number);
    const names = Object.keys(V2);
    if (parts.length !== names.length) return null;
    const old = Object.fromEntries(names.map((f, i) => [f, V2[f][parts[i]] ?? V2[f][0]]));
    // One "extra" became separate neck / back / ears slots and the shirt print; girls had lashes.
    const { extra, face, ...rest } = old;
    return {
      ...defaultLook(),
      ...rest,
      ...splitFace(face),
      pattern: extra === 'heart' ? 'heart' : 'plain',
      neck: extra === 'scarf' ? 'scarf' : 'none',
      back: extra === 'backpack' ? 'backpack' : 'none',
      ears: extra === 'earrings' ? 'earrings' : 'none',
      eyeShape: old.body === 'girl' ? 'lashes' : 'round',
      hatColor: old.topColor,
      extraColor: oldExtraColor({ back: extra }),
    };
  }
  // Older "#shirt|#hair|#skin|style" codes (first version of the look picker).
  const [shirt, hair, skin, style] = text.split('|');
  if (!/^#[0-9a-f]{6}$/i.test(shirt ?? '')) return null;
  return { ...defaultLook(), topColor: shirt, hair, skin, hairStyle: LOOK_OPTIONS.hairStyle.includes(style) ? style : 'short' };
}
