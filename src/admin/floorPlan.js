/**
 * A light, editable preview of a museum: a floor plan (SVG) drawn with the
 * same layout code the 3D museum uses, so what you see here is exactly where
 * each photo will hang. Drawn sideways to fit the screen: the entrance is on
 * the left and you walk towards the right.
 *
 * Every wall spot for a photo is a numbered circle — green with a photo, red
 * without. Click a spot, a room, the start dot or the last room to edit it;
 * drag a green spot onto another spot (or room) to move that photo.
 */
import { planMuseum, WALL_THICKNESS, FINALE_DOOR_WIDTH } from '../world/layout.js';

const NS = 'http://www.w3.org/2000/svg';
const FINALE_SIZE = 9;

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
 * @param photos  [{ id, room, slot, width, height, color, title }]
 * @param videos  [{ id, room, width, height, title }]
 * @param opts {
 *   selected   what's highlighted: { kind: 'room', index } | { kind: 'spot', room, slot } | { kind: 'start' } | { kind: 'finale' }
 *   onSelect   (selection | { kind: 'video', video }) => void
 *   onDrop     (photo, { room, slot } | { room }) => void   — a photo dragged to a spot or a room
 *   onVideoDrop (video, room) => void
 * }
 * @returns { svg, plan }
 */
export function renderFloorPlan(config, photos, videos, opts = {}) {
  const { selected = null, onSelect = () => {}, onDrop = () => {}, onVideoDrop = () => {} } = opts;
  const plan = planMuseum(config, photos, videos);
  const { z0, z1 } = plan.bounds;
  // With the hidden room switched off, still show where it would be (faded) so it can be switched on.
  const ghostFinale = !config.finale.enabled;
  const zEnd = ghostFinale ? z0 - FINALE_SIZE - WALL_THICKNESS : z0;
  const x0 = Math.min(plan.bounds.x0, ghostFinale ? -FINALE_SIZE / 2 - WALL_THICKNESS : Infinity);
  const x1 = Math.max(plan.bounds.x1, ghostFinale ? FINALE_SIZE / 2 + WALL_THICKNESS : -Infinity);
  const pad = 1.6;
  const svg = el('svg', {
    viewBox: `${-z1 - pad} ${x0 - pad} ${z1 - zEnd + pad * 2} ${x1 - x0 + pad * 2}`,
    class: 'floor-plan',
    role: 'img',
    'aria-label': 'Floor plan of the museum, entrance on the left',
  });
  const is = (kind, test = () => true) => selected?.kind === kind && test(selected);

  // Rooms: floor + walls (click to select).
  const roomRects = plan.rooms.map((room) => {
    const finale = room.isFinale;
    const on = finale ? is('finale') : is('room', (s) => s.index === room.index);
    const rect = box(room.x0, room.x1, room.z0, room.z1, {
      fill: room.wall, stroke: '#5a3a28', 'stroke-width': WALL_THICKNESS,
      class: `plan-room-floor editable${on ? ' selected' : ''}`,
    });
    rect.addEventListener('click', () => onSelect(finale ? { kind: 'finale' } : { kind: 'room', index: room.index }));
    svg.append(rect);
    return rect;
  });
  if (ghostFinale) {
    const last = plan.rooms.at(-1);
    const s = FINALE_SIZE;
    const zN = last.z0 - WALL_THICKNESS;
    const rect = box(-s / 2, s / 2, zN - s, zN, {
      fill: '#5a2a3a', stroke: '#5a3a28', 'stroke-width': WALL_THICKNESS,
      class: `plan-room-floor editable plan-finale-off${is('finale') ? ' selected' : ''}`,
    });
    rect.addEventListener('click', () => onSelect({ kind: 'finale' }));
    svg.append(rect);
    svg.append(el('text', { x: px(0, zN - s / 2), y: py(0), class: 'plan-room', 'font-size': 0.8, fill: '#f8d7dc', 'pointer-events': 'none' }, '♥ hidden room · off'));
    svg.append(box(-FINALE_DOOR_WIDTH / 2, FINALE_DOOR_WIDTH / 2, last.z0 - WALL_THICKNESS * 1.2, last.z0 + 0.05, { fill: '#5a3a28', 'pointer-events': 'none' }));
  }

  // Door openings (drawn over the walls) — the last one has a curtain.
  for (const door of plan.doors) {
    svg.append(box(door.x - door.width / 2, door.x + door.width / 2, door.zSouthFace - WALL_THICKNESS * 1.6, door.zSouthFace + WALL_THICKNESS * 0.6, {
      fill: door.curtain ? '#8e1530' : '#e9dccb', 'pointer-events': 'none',
    }));
  }

  // Benches, and the video screens in front of them.
  const badges = []; // draggable: { kind: 'photo' | 'video', item, label, g }
  const spotBadges = []; // drop places: { spot, cx, cy, g }
  for (const bench of plan.benches) {
    svg.append(box(bench.x - 0.28, bench.x + 0.28, bench.z - 1.1, bench.z + 1.1, { fill: '#a8754f', stroke: '#5a3a28', 'stroke-width': 0.05, 'pointer-events': 'none' }));
    if (!bench.screen) continue;
    const s = bench.screen;
    const t = 0.34;
    svg.append(box(s.x + s.nx * t - t / 2, s.x + s.nx * t + t / 2, s.z - s.width / 2, s.z + s.width / 2, { fill: '#1c1a1b', 'pointer-events': 'none' }));
    const bx = s.x + s.nx * 1.3;
    const g = badge(svg, px(bx, s.z), py(bx), '▶', `▶ ${bench.video.title || 'Video'} — plays when someone sits on this bench`, 'plan-video');
    badges.push({ kind: 'video', item: bench.video, label: '▶', g });
  }

  // Photo spots on the walls: a coloured bar where a photo hangs, and a numbered circle.
  for (const spot of plan.spots) {
    if (spot.blocked) continue;
    const alongX = spot.nz !== 0; // on a north/south wall the frame runs along X
    const t = 0.34;
    const cx = spot.x + spot.nx * t;
    const cz = spot.z + spot.nz * t;
    if (spot.photo) {
      const { width } = plan.frames.find((f) => f.photo === spot.photo);
      const half = width / 2;
      const bar = { fill: spot.photo.color || '#ccc', stroke: '#3b2a26', 'stroke-width': 0.06, 'pointer-events': 'none' };
      svg.append(alongX ? box(cx - half, cx + half, cz - t / 2, cz + t / 2, bar) : box(cx - t / 2, cx + t / 2, cz - half, cz + half, bar));
    } else {
      const half = 0.55;
      const bar = { fill: 'none', stroke: '#c0392b', 'stroke-width': 0.05, 'stroke-dasharray': '0.15 0.12', 'pointer-events': 'none' };
      svg.append(alongX ? box(cx - half, cx + half, cz - t / 2, cz + t / 2, bar) : box(cx - t / 2, cx + t / 2, cz - half, cz + half, bar));
    }
    const bx = spot.x + spot.nx * 1.25;
    const bz = spot.z + spot.nz * 1.25;
    const room = spot.roomIndex + 1;
    const on = is('spot', (s) => s.room === room && s.slot === spot.slot);
    const title = spot.photo ? spot.photo.title || `Photo ${spot.number}` : `Spot ${spot.number} — empty: click to add a photo`;
    const g = badge(svg, px(bx, bz), py(bx), String(spot.number), title, `${spot.photo ? 'plan-filled' : 'plan-empty'}${on ? ' selected' : ''}`);
    g.dataset.spot = spot.number;
    spotBadges.push({ spot, cx: px(bx, bz), cy: py(bx), g });
    if (spot.photo) badges.push({ kind: 'photo', item: spot.photo, spot, label: String(spot.number), g });
    else g.addEventListener('click', () => onSelect({ kind: 'spot', room, slot: spot.slot }));
  }

  // Where visitors start (click it to edit the start screen).
  const { x, z } = plan.start;
  const start = el('g', { class: `plan-start-dot${is('start') ? ' selected' : ''}`, tabindex: 0 });
  start.append(el('title', {}, 'Start screen: title, link, language…'));
  start.append(el('circle', { cx: px(x, z), cy: py(x), r: 0.55, class: 'plan-start' }));
  start.append(el('text', { x: px(x, z), y: py(x) + 1.35, class: 'plan-start-label', 'font-size': 0.7 }, 'start'));
  start.addEventListener('click', () => onSelect({ kind: 'start' }));
  svg.append(start);

  // Room names last (on top), in the aisle between the benches — the first
  // one a little higher, clear of the start dot.
  for (const room of plan.rooms) {
    const label = room.isFinale ? `♥ ${room.title}` : room.title;
    const size = Math.min(1.2, room.depth / Math.max(5, label.length * 0.62));
    svg.append(el('text', {
      x: px(room.cx, room.cz), y: py(room.cx) - (room.index === 0 ? 1.2 : 0), class: 'plan-room', 'font-size': size,
      fill: room.isFinale ? '#f8d7dc' : 'rgba(46, 34, 32, 0.6)', 'pointer-events': 'none',
      ...(room.isFinale ? { style: 'stroke: rgba(40, 8, 20, 0.6)' } : {}),
    }, label));
  }

  // ── Dragging photos (green spots) and videos (▶) ──────────────────
  let drag = null;
  const toPlan = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  /** The gallery room under a plan point. */
  const roomAt = (p) => plan.rooms.find((r) => !r.isFinale && p.y > r.x0 && p.y < r.x1 && -p.x > r.z0 && -p.x < r.z1);
  const spotAt = (p) => spotBadges.find((s) => Math.hypot(s.cx - p.x, s.cy - p.y) < 0.9) ?? null;

  for (const b of badges) {
    b.g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      svg.setPointerCapture(e.pointerId);
      drag = { b, start: toPlan(e), moved: false, ghost: null, room: null, spot: null };
    });
  }
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toPlan(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 0.4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = el('g', { class: `plan-ghost${drag.b.kind === 'video' ? ' video' : ''}`, 'pointer-events': 'none' });
      drag.ghost.append(el('circle', { r: 0.75 }), el('text', { class: 'plan-number', 'font-size': 0.8 }, drag.b.label));
      svg.append(drag.ghost);
      drag.b.g.classList.add('dragging');
    }
    drag.ghost.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const spot = drag.b.kind === 'photo' ? spotAt(p) : null;
    const room = spot ? null : roomAt(p);
    roomRects.forEach((r, i) => r.classList.toggle('drop-target', room?.index === i));
    spotBadges.forEach((s) => s.g.classList.toggle('drop-onto', s === spot && s.spot !== drag.b.spot));
    drag.room = room;
    drag.spot = spot;
  });
  const end = (cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ghost?.remove();
    d.b.g.classList.remove('dragging');
    roomRects.forEach((r) => r.classList.remove('drop-target'));
    spotBadges.forEach((s) => s.g.classList.remove('drop-onto'));
    if (cancelled) return;
    if (!d.moved) {
      if (d.b.kind === 'video') onSelect({ kind: 'video', video: d.b.item });
      else onSelect({ kind: 'spot', room: d.b.spot.roomIndex + 1, slot: d.b.spot.slot });
    } else if (d.b.kind === 'video') {
      if (d.room) onVideoDrop(d.b.item, d.room.index + 1);
    } else if (d.spot && d.spot.spot !== d.b.spot) {
      onDrop(d.b.item, { room: d.spot.spot.roomIndex + 1, slot: d.spot.spot.slot });
    } else if (d.room) {
      onDrop(d.b.item, { room: d.room.index + 1 });
    }
  };
  svg.addEventListener('pointerup', () => end(false));
  svg.addEventListener('pointercancel', () => end(true));
  return { svg, plan };
}

/** A numbered (or ▶) circle that can be clicked or dragged. */
function badge(svg, cx, cy, label, title, kind) {
  const g = el('g', { class: `plan-badge-g ${kind}`, tabindex: 0 });
  g.append(el('title', {}, title));
  g.append(el('circle', { cx, cy, r: 0.62, class: 'plan-badge' }));
  g.append(el('text', { x: cx, y: cy, class: 'plan-number', 'font-size': label.length > 2 ? 0.55 : 0.68 }, label));
  svg.append(g);
  return g;
}
