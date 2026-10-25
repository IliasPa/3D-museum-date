/**
 * A light, editable preview of a museum: a floor plan (SVG) drawn with the
 * same layout code the 3D museum uses, so what you see here is exactly where
 * each photo will hang. Drawn sideways to fit the screen: the entrance is on
 * the left and you walk towards the right.
 *
 * Click a room to select it; drag a photo's (or video's) number onto another
 * room — or onto another photo to take its place.
 */
import { planMuseum, WALL_THICKNESS } from '../world/layout.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

// Museum coordinates (x = west→east, z = south→north as it decreases) → plan
// coordinates (left→right = walking direction, top = the left-hand wall).
const px = (x, z) => -z;
const py = (x) => x;
/** A rectangle given in museum coordinates. */
function box(x0, x1, z0, z1, attrs) {
  return el('rect', { x: -z1, y: x0, width: z1 - z0, height: x1 - x0, ...attrs });
}

/**
 * @param config  museum settings (museumConfig.js)
 * @param photos  [{ id, room, width, height, color, title }]
 * @param videos  [{ id, room, width, height, title }]
 * @param opts {
 *   selectedRoom   index of the highlighted room (or -1)
 *   onRoomClick    (roomIndex) => void
 *   onItemClick    (photo or video) => void
 *   onDrop         (item, roomIndex, ontoItem | null) => void — after a drag
 * }
 * @returns { svg, plan }
 */
export function renderFloorPlan(config, photos, videos, opts = {}) {
  const { selectedRoom = -1, onRoomClick = () => {}, onItemClick = () => {}, onDrop = () => {} } = opts;
  const plan = planMuseum(config, photos, videos);
  const { x0, x1, z0, z1 } = plan.bounds;
  const pad = 1.6;
  const svg = el('svg', {
    viewBox: `${-z1 - pad} ${x0 - pad} ${z1 - z0 + pad * 2} ${x1 - x0 + pad * 2}`,
    class: 'floor-plan',
    role: 'img',
    'aria-label': 'Floor plan of the museum, entrance on the left',
  });

  // Rooms: floor + walls (click to select).
  const roomRects = plan.rooms.map((room) => {
    const rect = box(room.x0, room.x1, room.z0, room.z1, {
      fill: room.wall, stroke: '#5a3a28', 'stroke-width': WALL_THICKNESS,
      class: `plan-room-floor${room.index === selectedRoom ? ' selected' : ''}${room.isFinale ? '' : ' editable'}`,
    });
    if (!room.isFinale) rect.addEventListener('click', () => onRoomClick(room.index));
    svg.append(rect);
    return rect;
  });

  // Door openings (drawn over the walls) — the last one has a curtain.
  for (const door of plan.doors) {
    svg.append(box(door.x - door.width / 2, door.x + door.width / 2, door.zSouthFace - WALL_THICKNESS * 1.6, door.zSouthFace + WALL_THICKNESS * 0.6, {
      fill: door.curtain ? '#8e1530' : '#e9dccb', 'pointer-events': 'none',
    }));
  }

  // Benches, and the video screens in front of them.
  const badges = []; // { item, cx, cy, g, label, video }
  for (const bench of plan.benches) {
    svg.append(box(bench.x - 0.28, bench.x + 0.28, bench.z - 1.1, bench.z + 1.1, { fill: '#a8754f', stroke: '#5a3a28', 'stroke-width': 0.05, 'pointer-events': 'none' }));
    if (!bench.screen) continue;
    const s = bench.screen;
    const t = 0.34;
    svg.append(box(s.x + s.nx * t - t / 2, s.x + s.nx * t + t / 2, s.z - s.width / 2, s.z + s.width / 2, { fill: '#1c1a1b', 'pointer-events': 'none' }));
    const bx = s.x + s.nx * 1.3;
    badges.push(badge(svg, bench.video, px(bx, s.z), py(bx), '▶', `▶ ${bench.video.title || 'Video'} — plays when someone sits on this bench`, true));
  }

  // Photos on the walls: a coloured bar each, numbered in walking order.
  plan.frames.forEach((f) => {
    const alongX = f.nz !== 0; // on a north/south wall the frame runs along X
    const half = f.width / 2;
    const t = 0.34;
    const cx = f.x + f.nx * t;
    const cz = f.z + f.nz * t;
    const bar = { fill: f.photo.color || '#ccc', stroke: '#3b2a26', 'stroke-width': 0.06, 'pointer-events': 'none' };
    svg.append(alongX ? box(cx - half, cx + half, cz - t / 2, cz + t / 2, bar) : box(cx - t / 2, cx + t / 2, cz - half, cz + half, bar));
    const bx = f.x + f.nx * 1.25;
    const bz = f.z + f.nz * 1.25;
    const number = photos.indexOf(f.photo) + 1;
    badges.push(badge(svg, f.photo, px(bx, bz), py(bx), String(number), f.photo.title || `Photo ${number}`, false));
  });

  // Where visitors start.
  const { x, z } = plan.start;
  svg.append(el('circle', { cx: px(x, z), cy: py(x), r: 0.5, class: 'plan-start', 'pointer-events': 'none' }));
  svg.append(el('text', { x: px(x, z), y: py(x) + 1.4, class: 'plan-start-label', 'font-size': 0.7 }, 'start'));

  // Room names last (on top), in the aisle between the benches — the first
  // one a little higher, clear of the start dot.
  for (const room of plan.rooms) {
    const label = room.isFinale ? `♥ ${room.title}` : room.title;
    const size = Math.min(1.2, room.depth / Math.max(5, label.length * 0.62));
    svg.append(el('text', {
      x: px(room.cx, room.cz), y: py(room.cx) - (room.index === 0 ? 1.2 : 0), class: 'plan-room', 'font-size': size,
      fill: room.isFinale ? '#f8d7dc' : 'rgba(46, 34, 32, 0.6)',
      ...(room.isFinale ? { style: 'stroke: rgba(40, 8, 20, 0.6)' } : {}),
    }, label));
  }

  // ── Dragging numbers ───────────────────────────────────────────────
  let drag = null;
  const toPlan = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  /** The (non-final) room under a plan point. */
  const roomAt = (p) => plan.rooms.find((r) => !r.isFinale && p.y > r.x0 && p.y < r.x1 && -p.x > r.z0 && -p.x < r.z1);

  for (const b of badges) {
    b.g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      svg.setPointerCapture(e.pointerId);
      drag = { b, start: toPlan(e), moved: false, ghost: null, room: null, onto: null };
    });
  }
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toPlan(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 0.4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = el('g', { class: 'plan-ghost', 'pointer-events': 'none' });
      drag.ghost.append(el('circle', { r: 0.75 }), el('text', { class: 'plan-number', 'font-size': 0.8 }, drag.b.label));
      svg.append(drag.ghost);
      drag.b.g.classList.add('dragging');
    }
    drag.ghost.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const room = roomAt(p);
    roomRects.forEach((r, i) => r.classList.toggle('drop-target', room?.index === i));
    // Over another photo? Then the dragged one takes its place.
    let onto = null;
    if (!drag.b.video) {
      for (const o of badges) {
        if (o !== drag.b && !o.video && Math.hypot(o.cx - p.x, o.cy - p.y) < 0.9) onto = o;
      }
    }
    badges.forEach((o) => o.g.classList.toggle('drop-onto', o === onto));
    drag.room = room;
    drag.onto = onto;
  });
  const end = (cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ghost?.remove();
    d.b.g.classList.remove('dragging');
    roomRects.forEach((r) => r.classList.remove('drop-target'));
    badges.forEach((o) => o.g.classList.remove('drop-onto'));
    if (cancelled) return;
    if (!d.moved) onItemClick(d.b.item);
    else if (d.room) onDrop(d.b.item, d.room.index, d.onto?.item ?? null);
  };
  svg.addEventListener('pointerup', () => end(false));
  svg.addEventListener('pointercancel', () => end(true));
  return { svg, plan };
}

/** A numbered (or ▶) circle that can be clicked or dragged. */
function badge(svg, item, cx, cy, label, title, video) {
  const g = el('g', { class: `plan-photo${video ? ' plan-video-badge' : ''}`, tabindex: 0 });
  g.append(el('title', {}, title));
  g.append(el('circle', { cx, cy, r: 0.62, class: `plan-badge${video ? ' plan-video' : ''}` }));
  g.append(el('text', { x: cx, y: cy, class: 'plan-number', 'font-size': video ? 0.62 : 0.72 }, label));
  svg.append(g);
  return { item, cx, cy, g, label, video };
}
