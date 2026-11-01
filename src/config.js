/**
 * ════════════════════════════════════════════════════════════════════
 *  OUR MUSEUM — shared settings for every museum.
 *
 *  Each couple's own texts, rooms, message, song, photos and guests are
 *  edited on the curator page (/admin). The texts and rooms below are
 *  only the starting point for a brand-new museum (and the preview on
 *  the sign-in page). Everything else here — avatar, controls, camera,
 *  frames, graphics — applies to all museums.
 *
 *  While `npm run dev` is running, save this file and the browser
 *  reloads by itself.
 * ════════════════════════════════════════════════════════════════════
 */
export const CONFIG = {
  // ── Start screen ────────────────────────────────────────────────
  title: 'Our Museum',
  subtitle: 'a tiny gallery of us',
  enterLabel: 'Enter',
  // Language of your texts: 'en' for English, 'el' if you write in Greek
  // (makes Greek CAPITAL letters drop their accents correctly, e.g. ΜΑΪΟΣ).
  language: 'en',

  // ── Rooms, in the order you walk through them ───────────────────
  // (Default for new museums — each museum's rooms are edited in /admin.)
  // Rooms grow automatically when you give them lots of photos.
  //   wall  – wall paint colour
  //   trim  – colour of the door frames / sign text in that room
  rooms: [
    { title: 'How we met', wall: '#efe2d0', trim: '#7a4e33' },
    { title: 'Our trips', wall: '#dbe6df', trim: '#4f7366' },
    { title: 'Us now', wall: '#f1dcd8', trim: '#8f4f59' },
  ],

  // ── The hidden last room, behind the red curtain ────────────────
  finale: {
    enabled: true,
    doorSign: 'One more thing…', // written above the curtain
    title: 'For you', // shown when you step inside
    // Each museum's message is written in /admin → Texts.
    message: `[Your message goes here.]

Write something from the heart on the curator page → Texts.
Every line break you type shows up here, too.`,
    signature: '— Me',
  },

  // ── Seasonal decorations ────────────────────────────────────────
  // (Each museum picks its own in /admin → Preview → start dot.)
  // 'none', 'seasonal' (changes with the date by itself), or one of
  // 'halloween' | 'christmas' | 'winter' | 'valentine' | 'spring' | 'summer' | 'autumn'.
  decoration: 'none',

  // ── Proposal mode (/admin → Proposal) ───────────────────────────
  proposal: {
    enabled: false,
    proposer: '', // the guest email who kneels with the ring
    question: 'Will you marry me?',
    yes: 'YES 💍',
    no: 'No',
    after: 'Best answer ever ♥',
    metal: 'gold', // 'gold' | 'silver' | 'rose'
    gem: '#e8f4ff',
  },

  // ── Key hunt (/admin → Key hunt) ────────────────────────────────
  hunt: {
    enabled: false,
    count: 5, // how many to hide
    shape: 'key', // 'key' | 'heart' | 'star' | 'ring' | 'flower' | 'shell'
    obvious: false, // bigger and glowing, for easier finding
    locks: true, // the curtain stays closed until every one is found
    keys: [], // [{ id, photo, x, y }] — x, y from 0…1 across the photo
  },

  // ── Memory map table in the hidden last room (/admin → Memory map) ──
  // Shows a pin wherever the photos were taken (only if some have a place).
  memoryMap: {
    enabled: true,
    title: 'Our places',
  },

  // ── The mirror (a spot on the walls; /admin → Preview) ──────────
  mirror: {
    enabled: true,
    room: null, // where it hangs (null = the last room's first free spot)
    slot: null,
  },

  // ── Music ───────────────────────────────────────────────────────
  // Each museum can have its own song (/admin → Music). Without one,
  // public/audio/song.mp3 plays.
  music: {
    volume: 0.7, // 0…1 (iPhones ignore this and use the phone's volume buttons)
  },

  // ── Avatar ──────────────────────────────────────────────────────
  avatar: {
    // 'procedural' = the built-in cute character made of simple shapes.
    // 'glb'        = your own model (e.g. from Mixamo) — see README → "Use your own avatar".
    type: 'procedural',
    colors: {
      skin: '#f5cfb6',
      hair: '#4a3026',
      shirt: '#e8737f',
      pants: '#3e4a6b',
      shoes: '#2b2b33',
      blush: '#ff8fa3',
    },
    glb: {
      url: 'models/avatar.glb', // put the file in public/models/
      height: 1.25, // model is scaled to this height in metres
      idleClip: 'idle', // animation names inside the .glb (case-insensitive, partial match)
      walkClip: 'walk',
      runClip: 'run', // optional
      rotationY: 0, // set to Math.PI if the model walks backwards
    },
  },

  // ── Movement & camera feel ──────────────────────────────────────
  controls: {
    walkSpeed: 2.4, // metres per second
    runSpeed: 4.4, // holding Shift, or pushing the joystick all the way
    lookSensitivity: 1, // mouse/swipe camera speed multiplier
  },
  camera: {
    distance: 4.2, // how far behind the avatar
    minDistance: 2,
    maxDistance: 7, // mouse wheel zooms between min and max
    pitch: 0.3, // starting tilt (radians): higher = more top-down
    fov: 60,
  },

  // ── Photos on the walls ─────────────────────────────────────────
  frames: {
    maxWidth: 1.5, // metres; photos keep their shape inside this box
    maxHeight: 1.3,
    centerHeight: 1.75, // height of the photo centre above the floor
    spacing: 2.6, // distance between neighbouring photos
    style: 'walnut', // 'walnut' | 'gold' | 'black' | 'white'
    showOverlayWithin: 2.6, // metres — how close to walk before the caption appears
  },

  // ── Performance ─────────────────────────────────────────────────
  graphics: {
    maxPixelRatio: 2, // render resolution cap (phones have 3× screens; 2 looks great and is faster)
    adaptiveResolution: true, // lower the resolution automatically if a device struggles
  },
};
