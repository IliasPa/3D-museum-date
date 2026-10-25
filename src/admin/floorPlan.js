/**
 * A very light preview of a museum: a floor plan (SVG) drawn with the same
 * layout code the 3D museum uses, so what you see here is exactly where each
 * photo will hang. Drawn sideways to fit the screen: the entrance is on the
 * left and you walk towards the right.
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
 * @param onPhotoClick (photo) => void
 */
export function renderFloorPlan(config, photos, onPhotoClick = () => {}) {
  const plan = planMuseum(config, photos);
  const { x0, x1, z0, z1 } = plan.bounds;
  const pad = 1.6;
  const svg = el('svg', {
    viewBox: `${-z1 - pad} ${x0 - pad} ${z1 - z0 + pad * 2} ${x1 - x0 + pad * 2}`,
    class: 'floor-plan',
    role: 'img',
    'aria-label': 'Floor plan of the museum, entrance on the left',
  });

  // Rooms: floor + walls.
  for (const room of plan.rooms) {
    svg.append(box(room.x0, room.x1, room.z0, room.z1, {
      fill: room.wall, stroke: '#5a3a28', 'stroke-width': WALL_THICKNESS,
    }));
    const label = room.isFinale ? `♥ ${room.title}` : room.title;
    const size = Math.min(1.3, room.depth / Math.max(5, label.length * 0.6));
    svg.append(el('text', {
      x: px(room.cx, room.cz), y: py(room.cx - room.width * 0.2), class: 'plan-room', 'font-size': size, // above the start dot
      fill: room.isFinale ? '#f8d7dc' : 'rgba(46, 34, 32, 0.55)',
    }, label));
  }

  // Door openings (drawn over the walls) — the last one has a curtain.
  for (const door of plan.doors) {
    svg.append(box(door.x - door.width / 2, door.x + door.width / 2, door.zSouthFace - WALL_THICKNESS * 1.6, door.zSouthFace + WALL_THICKNESS * 0.6, {
      fill: door.curtain ? '#8e1530' : '#e9dccb',
    }));
  }

  // Photos on the walls: a coloured bar each, numbered in walking order.
  plan.frames.forEach((f) => {
    const alongX = f.nz !== 0; // on a north/south wall the frame runs along X
    const half = f.width / 2;
    const t = 0.34;
    const cx = f.x + f.nx * t;
    const cz = f.z + f.nz * t;
    const number = photos.indexOf(f.photo) + 1;
    const g = el('g', { class: 'plan-photo', tabindex: 0 });
    g.append(el('title', {}, f.photo.title || `Photo ${number}`));
    g.append(alongX
      ? box(cx - half, cx + half, cz - t / 2, cz + t / 2, { fill: f.photo.color || '#ccc', stroke: '#3b2a26', 'stroke-width': 0.06 })
      : box(cx - t / 2, cx + t / 2, cz - half, cz + half, { fill: f.photo.color || '#ccc', stroke: '#3b2a26', 'stroke-width': 0.06 }));
    const bx = f.x + f.nx * 1.25;
    const bz = f.z + f.nz * 1.25;
    g.append(el('circle', { cx: px(bx, bz), cy: py(bx), r: 0.62, class: 'plan-badge' }));
    g.append(el('text', { x: px(bx, bz), y: py(bx), class: 'plan-number', 'font-size': 0.72 }, String(number)));
    g.addEventListener('click', () => onPhotoClick(f.photo));
    g.addEventListener('keydown', (e) => e.key === 'Enter' && onPhotoClick(f.photo));
    svg.append(g);
  });

  // Where visitors start.
  const { x, z } = plan.start;
  svg.append(el('circle', { cx: px(x, z), cy: py(x), r: 0.5, class: 'plan-start' }));
  svg.append(el('text', { x: px(x, z), y: py(x) + 1.4, class: 'plan-start-label', 'font-size': 0.7 }, 'start'));
  return svg;
}
