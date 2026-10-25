/**
 * ════════════════════════════════════════════════════════════════════
 *  OUR MUSEUM — everything you'll want to personalise lives here.
 *  (Which photo hangs where is in photos/photos.json.)
 *
 *  While `npm run dev` is running, just save this file and the
 *  browser reloads by itself.
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
  // In photos.json, "room": 1 means the first room below, 2 the second…
  // Add or remove entries to change the number of rooms. Rooms grow
  // automatically when you give them lots of photos.
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
    // Your personal message. Line breaks are kept. Write as much as you like.
    message: `[Your message goes here.]

Write something from the heart in src/config.js → finale.message.
Every line break you type shows up here, too.`,
    signature: '— Me',
  },

  // ── Music ───────────────────────────────────────────────────────
  // Replace public/audio/song.mp3 with your song (keep the name, or change it here).
  music: {
    src: 'audio/song.mp3',
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
