/**
 * Museum floor plan
 * ─────────────────
 * Turns the room list and the photo list (both from the curator page) into plain
 * numbers: where each room is, where the doors are and where every photo
 * hangs. There's no three.js in here — museum.js turns this plan into 3D.
 *
 * Rooms are laid out in a line, walking "north" (towards −Z):
 *
 *            ┌───────┐
 *            │ final │      ← hidden behind a curtain
 *        ┌───┴─ ~ ─┴───┐
 *        │   room 3    │
 *        ├────┘   └────┤
 *        │   room 2    │
 *        ├────┘   └────┤
 *        │   room 1    │  ← you start here, facing north
 *        └─────────────┘
 *
 * Units are metres. X = east/west, Z = south(+)/north(−), Y = up.
 */
export const WALL_THICKNESS = 0.3;
export const WALL_HEIGHT = 4.2;
export const DOOR_WIDTH = 2.4;
export const DOOR_HEIGHT = 3.0;
export const FINALE_DOOR_WIDTH = 1.8;

export const ROOM_SIZE = 12; // starting width & depth of a room (the curator can change it)
export const MIN_ROOM = 8; // smallest / largest size the curator can pick for a room
export const MAX_ROOM = 30;
const FINALE_SIZE = 9;
const CORNER_MARGIN = 1.0; // keep frames this far from corners…
const DOOR_MARGIN = 0.8; // …and from door openings…
const SIGN_MARGIN = 0.3; // …and from the welcome sign
const FRAME_BORDER = 0.1; // frame moulding width on each side of the photo
const BENCH_OFFSET = 2.3; // benches stand this far either side of the centre aisle
const SCREEN = { maxWidth: 2.2, maxHeight: 1.3, gap: 1.5 }; // video screens (gap = wall kept free either side of centre)
export const WELCOME_SIGN_WIDTH = 5.6; // on the first room's back wall (museum.js)

/**
 * Every room has fixed spots for photos along all four walls — they only
 * move when the room's size changes. A photo remembers its spot (`slot`, an
 * index into its room's spots); photos without one fill the free spots in
 * walking order. A video screen covers the spots behind it.
 *
 * @param photos [{ room, slot?, width, height, … }] in walking order
 * @param videos [{ room, width, height, … }] — each hangs on the wall in front of a bench
 * @returns { rooms, doors, frames (filled spots), spots (all of them), benches, start, bounds }
 */
export function planMuseum(config, photos, videos = []) {
  const defs = config.rooms.length ? config.rooms : [{ title: 'Gallery', wall: '#eee6dc', trim: '#6b4a35' }];
  const settings = config.frames;

  // Group the photos and videos by room, keeping their walking order.
  const photosByRoom = defs.map(() => []);
  for (const photo of photos) photosByRoom[roomIndexFor(photo.room, defs)].push(photo);
  const videosByRoom = defs.map(() => []);
  for (const video of videos) videosByRoom[roomIndexFor(video.room, defs)].push(video);

  const rooms = [];
  const spots = [];
  const benches = [];
  let zSouth = 0; // interior face of the current room's south wall

  defs.forEach((def, index) => {
    const fit = (v) => Math.min(MAX_ROOM, Math.max(MIN_ROOM, v));
    const width = fit(def.width ?? ROOM_SIZE);
    let depth = fit(def.depth ?? ROOM_SIZE);
    const doors = {
      southDoor: index > 0,
      northDoor: index < defs.length - 1 || config.finale.enabled,
      northDoorWidth: index === defs.length - 1 ? FINALE_DOOR_WIDTH : DOOR_WIDTH,
      welcomeSign: index === 0,
    };
    // A room keeps the size the curator chose. Only if it holds more than
    // fits (more photos than spots, more videos than benches) does it grow longer.
    let rect;
    let roomSpots;
    let roomBenches;
    for (;;) {
      rect = { x0: -width / 2, x1: width / 2, z0: zSouth - depth, z1: zSouth };
      roomBenches = benchesFor(rect, index);
      roomSpots = wallSpots(rect, settings, doors);
      const roomVideos = videosByRoom[index];
      if (roomVideos.length <= roomBenches.length) {
        roomVideos.forEach((video, i) => attachScreen(roomBenches[i], video, rect));
        coverSpotsBehindScreens(roomSpots, roomBenches, rect, settings);
        if (fillSpots(roomSpots, photosByRoom[index])) break;
      }
      depth += settings.spacing;
    }
    rooms.push(makeRoom(index, def, rect));
    for (const spot of roomSpots) spots.push({ ...spot, roomIndex: index });
    benches.push(...roomBenches);
    zSouth = zSouth - depth - WALL_THICKNESS;
  });
  // Spot numbers in walking order (the floor plan shows them).
  let number = 0;
  for (const spot of spots) if (!spot.blocked) spot.number = ++number;
  const frames = spots.filter((s) => s.photo).map((s) => ({ ...s, ...photoSize(s.photo, settings) }));

  if (config.finale.enabled) {
    const s = FINALE_SIZE;
    rooms.push(makeRoom(rooms.length, {
      title: config.finale.title,
      wall: '#5a2a3a',
      trim: '#d9b36c',
      isFinale: true,
    }, { x0: -s / 2, x1: s / 2, z0: zSouth - s, z1: zSouth }));
  }

  // A door in the shared wall between every pair of neighbouring rooms.
  const doors = [];
  for (let i = 0; i < rooms.length - 1; i++) {
    const south = rooms[i];
    const north = rooms[i + 1];
    const toFinale = north.isFinale;
    doors.push({
      south: i,
      north: i + 1,
      x: 0,
      zSouthFace: south.z0, // wall faces: south side (inside room i)…
      zNorthFace: north.z1, // …and north side (inside room i+1)
      width: toFinale ? FINALE_DOOR_WIDTH : DOOR_WIDTH,
      height: DOOR_HEIGHT,
      sign: toFinale ? config.finale.doorSign : north.title,
      curtain: toFinale,
    });
  }

  const first = rooms[0];
  return {
    rooms,
    doors,
    frames,
    spots,
    benches,
    start: { x: 0, z: first.z1 - 2.6 }, // a few steps in from the south wall
    bounds: {
      x0: Math.min(...rooms.map((r) => r.x0)) - WALL_THICKNESS,
      x1: Math.max(...rooms.map((r) => r.x1)) + WALL_THICKNESS,
      z0: rooms.at(-1).z0 - WALL_THICKNESS,
      z1: first.z1 + WALL_THICKNESS,
    },
  };
}

/**
 * Benches flanking the centre aisle — one pair per ~10 m of room length.
 * The west bench faces the west wall, the east bench the east wall; each has
 * two seats. Videos hang on the wall a bench faces.
 */
function benchesFor(rect, roomIndex) {
  const depth = rect.z1 - rect.z0;
  const cx = (rect.x0 + rect.x1) / 2;
  const pairs = Math.max(1, Math.floor(depth / 10));
  const list = [];
  for (let k = 0; k < pairs; k++) {
    const z = rect.z0 + (depth * (k + 0.5)) / pairs;
    for (const facing of [-1, 1]) {
      const x = cx + facing * BENCH_OFFSET;
      list.push({ x, z, roomIndex, facing, seats: [{ x, z: z - 0.55 }, { x, z: z + 0.55 }], video: null, screen: null });
    }
  }
  return list;
}

/** Put a video's screen on the wall in front of a bench. */
function attachScreen(bench, video, rect) {
  const aspect = video.width / video.height || 16 / 9;
  let w = SCREEN.maxWidth;
  let h = w / aspect;
  if (h > SCREEN.maxHeight) {
    h = SCREEN.maxHeight;
    w = h * aspect;
  }
  const nx = -bench.facing; // the wall faces back into the room
  bench.video = video;
  bench.screen = { x: bench.facing < 0 ? rect.x0 : rect.x1, z: bench.z, y: 1.75, nx, nz: 0, rotationY: Math.atan2(nx, 0), width: w, height: h };
}

/** "room": 2 → index 1. Also accepts the room's title. Unknown → first room. */
function roomIndexFor(room, defs) {
  if (typeof room === 'number' && room >= 1) return Math.min(Math.round(room), defs.length) - 1;
  if (typeof room === 'string') {
    const n = Number(room);
    if (Number.isFinite(n) && n >= 1) return Math.min(Math.round(n), defs.length) - 1;
    const i = defs.findIndex((d) => d.title.toLowerCase() === room.trim().toLowerCase());
    if (i >= 0) return i;
  }
  console.warn(`[museum] photo has unknown room "${room}", hanging it in room 1`);
  return 0;
}

function makeRoom(index, def, rect) {
  return {
    index,
    title: def.title,
    wall: def.wall,
    trim: def.trim,
    isFinale: Boolean(def.isFinale),
    ...rect,
    cx: (rect.x0 + rect.x1) / 2,
    cz: (rect.z0 + rect.z1) / 2,
    width: rect.x1 - rect.x0,
    depth: rect.z1 - rect.z0,
  };
}

/** Size of a photo inside the max box, keeping its aspect ratio. */
export function photoSize(photo, settings) {
  const aspect = photo.width / photo.height || 1;
  let w = settings.maxWidth;
  let h = w / aspect;
  if (h > settings.maxHeight) {
    h = settings.maxHeight;
    w = h * aspect;
  }
  return { width: w, height: h };
}

/**
 * The fixed photo spots along a room's walls, in walking order (clockwise
 * when seen from above, starting on the left/west wall, ending on the back
 * wall). They depend only on the room's size and doors.
 */
function wallSpots(rect, settings, opts) {
  const { x0, x1, z0, z1 } = rect;
  const W = x1 - x0;
  const D = z1 - z0;
  // Each wall: where it starts, which way it runs, and which way it faces (into the room).
  const walls = [
    { from: [x0, z1], dir: [0, -1], len: D, normal: [1, 0], gaps: [] }, // west, south→north
    { from: [x0, z0], dir: [1, 0], len: W, normal: [0, 1], gaps: opts.northDoor ? [[opts.northDoorWidth, DOOR_MARGIN]] : [] }, // north
    { from: [x1, z0], dir: [0, 1], len: D, normal: [-1, 0], gaps: [] }, // east, north→south
    { from: [x1, z1], dir: [-1, 0], len: W, normal: [0, -1], gaps: [ // south (the back wall)
      ...(opts.southDoor ? [[DOOR_WIDTH, DOOR_MARGIN]] : []),
      ...(opts.welcomeSign ? [[WELCOME_SIGN_WIDTH, SIGN_MARGIN]] : []),
    ] },
  ];
  const frameW = settings.maxWidth + FRAME_BORDER * 2;
  const spots = [];
  walls.forEach((wall, wallIndex) => {
    // Openings and signs are centred on their wall: keep them (and a margin) free.
    const blocked = wall.gaps.map(([g, margin]) => [wall.len / 2 - g / 2 - margin, wall.len / 2 + g / 2 + margin]);
    const edges = [0, wall.len, ...wall.gaps.flatMap(([g]) => [wall.len / 2 - g / 2, wall.len / 2 + g / 2])];
    let start = CORNER_MARGIN;
    const segments = [];
    for (const [a, b] of blocked.sort((p, q) => p[0] - q[0])) {
      if (a > start) segments.push([start, a]);
      start = Math.max(start, b);
    }
    if (wall.len - CORNER_MARGIN > start) segments.push([start, wall.len - CORNER_MARGIN]);
    for (const [a, b] of segments) {
      const len = b - a;
      if (len < frameW) continue;
      const k = 1 + Math.floor((len - frameW) / settings.spacing);
      const step = k > 1 ? Math.min((len - frameW) / (k - 1), Math.max(settings.spacing, len / k)) : 0;
      for (let j = 0; j < k; j++) {
        const t = (a + b) / 2 + (j - (k - 1) / 2) * step; // distance along the wall
        const { from, dir, normal } = wall;
        spots.push({
          slot: spots.length,
          wall: wallIndex,
          t,
          // Free wall either side (to a corner, door or sign): the frame's glow stays within it.
          free: Math.min(...edges.map((e) => Math.abs(e - t))),
          x: from[0] + dir[0] * t,
          z: from[1] + dir[1] * t,
          y: settings.centerHeight,
          nx: normal[0],
          nz: normal[1],
          rotationY: Math.atan2(normal[0], normal[1]),
          blocked: false,
          photo: null,
        });
      }
    }
  });
  return spots;
}

/** A video screen covers the spots behind it (on the wall its bench faces). */
function coverSpotsBehindScreens(spots, benches, rect, settings) {
  const frameW = settings.maxWidth + FRAME_BORDER * 2;
  for (const bench of benches) {
    if (!bench.screen) continue;
    const west = bench.screen.nx > 0;
    const ts = west ? rect.z1 - bench.z : bench.z - rect.z0; // distance along the west / east wall
    for (const spot of spots) {
      if (spot.wall !== (west ? 0 : 2)) continue;
      const d = Math.abs(spot.t - ts);
      if (d < SCREEN.gap + frameW / 2) spot.blocked = true;
      else spot.free = Math.min(spot.free, d - SCREEN.gap + 0.3);
    }
  }
}

/**
 * Puts each photo on its own spot; photos without a (free) spot of their own
 * take the first free ones. Returns false if there aren't enough spots.
 */
function fillSpots(spots, photos) {
  const homeless = [];
  for (const photo of photos) {
    const spot = Number.isInteger(photo.slot) ? spots[photo.slot] : null;
    if (spot && !spot.blocked && !spot.photo) spot.photo = photo;
    else homeless.push(photo);
  }
  for (const photo of homeless) {
    const spot = spots.find((s) => !s.blocked && !s.photo);
    if (!spot) return false;
    spot.photo = photo;
  }
  return true;
}
