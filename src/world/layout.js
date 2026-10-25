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

const ROOM_SIZE = 12; // starting width & depth of a room; grows if it needs more wall
const MAX_ROOM_WIDTH = 18; // past this, rooms only get longer (a gallery hall)
const FINALE_SIZE = 9;
const CORNER_MARGIN = 1.0; // keep frames this far from corners…
const DOOR_MARGIN = 0.8; // …and from door openings
const FRAME_BORDER = 0.1; // frame moulding width on each side of the photo
const BENCH_OFFSET = 2.3; // benches stand this far either side of the centre aisle
const SCREEN = { maxWidth: 2.2, maxHeight: 1.3, gap: 1.5 }; // video screens (gap = wall kept free either side of centre)

/**
 * @param photos [{ room, width, height, … }]
 * @param videos [{ room, width, height, … }] — each hangs on the wall in front of a bench
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
  const frames = [];
  const benches = [];
  let zSouth = 0; // interior face of the current room's south wall

  defs.forEach((def, index) => {
    const isFirst = index === 0;
    let width = ROOM_SIZE;
    let depth = ROOM_SIZE;
    let placed = null;
    let roomBenches;
    // Grow the room until all of its photos fit on the walls and every video has a bench.
    for (let attempt = 0; !placed; attempt++) {
      const rect = { x0: -width / 2, x1: width / 2, z0: zSouth - depth, z1: zSouth };
      roomBenches = benchesFor(rect, index);
      const roomVideos = videosByRoom[index];
      if (roomVideos.length <= roomBenches.length) {
        roomVideos.forEach((video, i) => attachScreen(roomBenches[i], video, rect));
        placed = placeFrames(rect, photosByRoom[index], settings, {
          southDoor: !isFirst,
          northDoor: index < defs.length - 1 || config.finale.enabled,
          northDoorWidth: index === defs.length - 1 ? FINALE_DOOR_WIDTH : DOOR_WIDTH,
          reserveSouthWall: isFirst, // the welcome sign hangs there
          screens: roomBenches.filter((b) => b.screen),
        });
      }
      if (!placed) {
        if (attempt % 2 === 0 || width + settings.spacing > MAX_ROOM_WIDTH) depth += settings.spacing;
        else width += settings.spacing;
      }
    }
    rooms.push(makeRoom(index, def, { x0: -width / 2, x1: width / 2, z0: zSouth - depth, z1: zSouth }));
    for (const f of placed) frames.push({ ...f, roomIndex: index });
    benches.push(...roomBenches);
    zSouth = zSouth - depth - WALL_THICKNESS;
  });

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
 * Hangs the photos along the walls in walking order (clockwise when seen from
 * above, starting on the left/west wall). Returns null if they don't fit, so
 * the caller can grow the room and try again.
 */
function placeFrames(rect, photos, settings, opts) {
  if (!photos.length) return [];
  const { x0, x1, z0, z1 } = rect;
  const W = x1 - x0;
  const D = z1 - z0;

  // Each wall: where it starts, which way it runs, and which way it faces (into the room).
  const walls = [
    { from: [x0, z1], dir: [0, -1], len: D, normal: [1, 0], door: 0 }, // west, south→north
    { from: [x0, z0], dir: [1, 0], len: W, normal: [0, 1], door: opts.northDoor ? opts.northDoorWidth : 0 }, // north
    { from: [x1, z0], dir: [0, 1], len: D, normal: [-1, 0], door: 0 }, // east, north→south
    { from: [x1, z1], dir: [-1, 0], len: W, normal: [0, -1], door: opts.southDoor ? DOOR_WIDTH : 0, skip: opts.reserveSouthWall }, // south
  ];
  // Wall space kept free: (centred) doors, and video screens on the side walls.
  for (const wall of walls) {
    wall.blocked = wall.door ? [[wall.len / 2 - wall.door / 2 - DOOR_MARGIN, wall.len / 2 + wall.door / 2 + DOOR_MARGIN]] : [];
  }
  for (const s of opts.screens ?? []) {
    const t = s.screen.nx > 0 ? z1 - s.z : s.z - z0; // distance along the west / east wall
    walls[s.screen.nx > 0 ? 0 : 2].blocked.push([t - SCREEN.gap, t + SCREEN.gap]);
  }

  // Split walls around the blocked parts into usable segments.
  const segments = [];
  for (const wall of walls) {
    if (wall.skip) continue;
    let start = CORNER_MARGIN;
    for (const [a, b] of wall.blocked.sort((p, q) => p[0] - q[0])) {
      if (a > start) segments.push({ wall, a: start, b: a, len: a - start });
      start = Math.max(start, b);
    }
    if (wall.len - CORNER_MARGIN > start) segments.push({ wall, a: start, b: wall.len - CORNER_MARGIN, len: wall.len - CORNER_MARGIN - start });
  }

  // How many frames fit on each segment.
  const frameW = settings.maxWidth + FRAME_BORDER * 2;
  for (const s of segments) s.capacity = s.len >= frameW ? 1 + Math.floor((s.len - frameW) / settings.spacing) : 0;
  const capacity = segments.reduce((sum, s) => sum + s.capacity, 0);
  if (capacity < photos.length) return null;

  // Share the photos between segments in proportion to their size
  // (largest-remainder rounding), so they spread around the whole room.
  const n = photos.length;
  const shares = segments.map((s) => (s.capacity * n) / capacity);
  segments.forEach((s, i) => (s.count = Math.floor(shares[i])));
  let left = n - segments.reduce((sum, s) => sum + s.count, 0);
  const byRemainder = segments.map((s, i) => i).sort((i, j) => (shares[j] % 1) - (shares[i] % 1));
  for (const i of byRemainder) {
    if (left === 0) break;
    if (segments[i].count < segments[i].capacity) {
      segments[i].count++;
      left--;
    }
  }

  // Evenly space the frames on each segment.
  const placed = [];
  let next = 0;
  for (const s of segments) {
    const k = s.count;
    if (!k) continue;
    const step = k > 1 ? Math.min((s.len - frameW) / (k - 1), Math.max(settings.spacing, s.len / k)) : 0;
    const mid = (s.a + s.b) / 2;
    for (let j = 0; j < k; j++) {
      const t = mid + (j - (k - 1) / 2) * step; // distance along the wall
      const photo = photos[next++];
      const { from, dir, normal } = s.wall;
      placed.push({
        photo,
        x: from[0] + dir[0] * t,
        z: from[1] + dir[1] * t,
        y: settings.centerHeight,
        nx: normal[0],
        nz: normal[1],
        rotationY: Math.atan2(normal[0], normal[1]),
        ...photoSize(photo, settings),
      });
    }
  }
  return placed;
}
