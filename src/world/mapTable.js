/**
 * The memory map: a wooden table in the middle of the hidden last room with
 * an old paper map on top (worldMap.js) — the countries you've been to
 * tinted, a dashed line from place to place in the order of the photos, a
 * compass, and the title along the edge nearest the curtain — and a pin wherever photos were taken, with a little
 * polaroid of the photo floating above it on a thread. Tap a pin (or its
 * polaroid) to see the photos from there.
 */
import * as THREE from 'three';
import { loadWorld, fitView, drawMap, groupPins, placeOf, TABLE_STYLE } from '../map/worldMap.js';

const TOP_W = 2.3;
const TOP_D = 1.45;
const HEIGHT = 0.86;
const RIM = 0.08; // the raised wooden edge round the map
const CARD_W = 0.17; // a polaroid, in metres
const CARD_H = 0.2;

/** Where the table stands in the last room (finale.js moves the heart back to make room). */
export function mapTableSpot(room) {
  return { x: room.cx, z: room.cz + 0.75 };
}

/**
 * @param room    the hidden last room (from the plan)
 * @param photos  the photos that have a place, in walking order
 * @param title   written on the map
 * @returns { group, pins, update(dt), hit(raycaster) → { photos, distance } | null }
 */
export function buildMapTable(room, photos, title, colliders) {
  const group = new THREE.Group();
  group.name = 'map-table';
  const { x, z } = mapTableSpot(room);
  group.position.set(x, 0, z);

  // ── The table: a top with a raised rim, on four turned legs ──
  const wood = new THREE.MeshLambertMaterial({ color: '#6b4423' });
  const dark = new THREE.MeshLambertMaterial({ color: '#4a2d17' });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TOP_W + RIM * 2, 0.06, TOP_D + RIM * 2), wood);
  top.position.y = HEIGHT - 0.03;
  group.add(top);
  for (const [w, d, px, pz] of [[TOP_W + RIM * 2, RIM, 0, (TOP_D + RIM) / 2], [TOP_W + RIM * 2, RIM, 0, -(TOP_D + RIM) / 2], [RIM, TOP_D, (TOP_W + RIM) / 2, 0], [RIM, TOP_D, -(TOP_W + RIM) / 2, 0]]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), dark);
    rim.position.set(px, HEIGHT + 0.0175, pz);
    group.add(rim);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, HEIGHT - 0.06, 12), wood);
      leg.position.set(sx * (TOP_W / 2 - 0.06), (HEIGHT - 0.06) / 2, sz * (TOP_D / 2 - 0.06));
      group.add(leg);
    }
  }
  colliders.push({ minX: x - TOP_W / 2 - RIM, maxX: x + TOP_W / 2 + RIM, minY: 0, maxY: HEIGHT, minZ: z - TOP_D / 2 - RIM, maxZ: z + TOP_D / 2 + RIM });

  // ── The map: drawn on a canvas once the outlines have downloaded ──
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = Math.round((2048 * TOP_D) / TOP_W);
  const g = canvas.getContext('2d');
  g.fillStyle = TABLE_STYLE.land;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Unlit, so the room's pink light doesn't wash it out (a touch darker to sit in the room).
  const map = new THREE.Mesh(new THREE.PlaneGeometry(TOP_W, TOP_D), new THREE.MeshBasicMaterial({ map: tex, color: '#ece4da' }));
  map.rotation.x = -Math.PI / 2;
  map.position.y = HEIGHT + 0.002;
  group.add(map);

  // ── Pins, each with a polaroid of its (first) photo floating above ──
  const view = fitView(photos.map(placeOf), TOP_W / TOP_D, { minSpan: 8 });
  const pinsGroup = new THREE.Group();
  group.add(pinsGroup);
  const pins = [];
  const headMat = new THREE.MeshPhongMaterial({ color: '#c4223f', shininess: 90, specular: '#ffd0da' });
  const needleMat = new THREE.MeshLambertMaterial({ color: '#d8d2c8' });
  const threadMat = new THREE.LineBasicMaterial({ color: '#7a5a3c', transparent: true, opacity: 0.7 });
  const grouped = groupPins(photos, view, 0.035).filter((pin) => Math.abs(pin.x - 0.5) < 0.49 && Math.abs(pin.y - 0.5) < 0.49);
  for (const [i, pin] of grouped.entries()) {
    const px = (pin.x - 0.5) * TOP_W;
    const pz = (pin.y - 0.5) * TOP_D;
    const p = new THREE.Group();
    p.position.set(px, HEIGHT, pz);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), needleMat);
    needle.position.y = 0.055;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.min(0.015, pin.photos.length * 0.003), 16, 12), headMat);
    head.position.y = 0.12;
    // A bigger, invisible target so a finger can hit it.
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    target.position.y = 0.11;
    p.add(needle, head, target);

    // Polaroids of pins close together float at different heights, so they don't cover each other.
    const crowd = grouped.slice(0, i).filter((o) => Math.hypot((o.x - pin.x) * TOP_W, (o.y - pin.y) * TOP_D) < CARD_W * 1.3).length;
    const lift = 0.36 + (crowd % 3) * 0.17;
    const card = new THREE.Sprite(new THREE.SpriteMaterial({ map: polaroidTexture(pin.photos), alphaTest: 0.5 }));
    card.scale.set(CARD_W, CARD_H, 1);
    card.position.y = lift;
    const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, lift - CARD_H / 2, 0)]), threadMat);
    p.add(card, thread);
    pinsGroup.add(p);
    pins.push({ group: p, head, target, card, lift, photos: pin.photos, phase: Math.random() * 6 });
  }

  loadWorld().then((world) => {
    const w = canvas.width;
    const h = canvas.height;
    const points = photos.map(placeOf);
    drawMap(g, world, view, w, h, { style: TABLE_STYLE, visited: points, route: grouped, paper: true, frame: true });
    // Soft shadows where the pins stand.
    g.fillStyle = 'rgba(40, 20, 10, 0.28)';
    for (const pin of grouped) {
      g.beginPath();
      g.ellipse(pin.x * w + 10, pin.y * h + 4, 20, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    drawCompass(g, 120, 130, 70);
    drawTitle(g, title || 'Our places', w / 2, h - 66); // on the near edge, where you come in (the polaroids would hide it further back)
    tex.needsUpdate = true;
  }).catch((err) => console.warn('[map] could not draw the map:', err.message));

  let time = 0;
  return {
    group,
    pins,
    update(dt) {
      time += dt;
      for (const p of pins) {
        p.head.position.y = 0.12 + Math.sin(time * 2 + p.phase) * 0.006;
        p.card.position.y = p.lift + Math.sin(time * 1.3 + p.phase) * 0.012;
      }
    },
    /** The photos of the pin (or polaroid) under the pointer, if any. */
    hit(raycaster) {
      const h = raycaster.intersectObjects(pins.flatMap((p) => [p.target, p.card]), false)[0];
      return h ? { photos: pins.find((p) => p.target === h.object || p.card === h.object).photos, distance: h.distance } : null;
    },
  };
}

/** A polaroid: the first photo of a pin, the place (or title) written under it, and how many photos if more. */
function polaroidTexture(photos) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 300;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const first = photos[0];
  const draw = (img) => {
    g.clearRect(0, 0, 256, 300);
    if (photos.length > 1) {
      // Another one peeking out behind it.
      g.save();
      g.translate(128, 150);
      g.rotate(0.09);
      g.fillStyle = '#efe9df';
      g.fillRect(-116, -138, 232, 276);
      g.restore();
    }
    g.fillStyle = '#fbf8f2';
    g.fillRect(8, 6, 240, 286);
    g.fillStyle = first.color || '#c9b8a6';
    g.fillRect(22, 20, 212, 196);
    if (img) {
      // Fill the window (like object-fit: cover).
      const s = Math.max(212 / img.width, 196 / img.height);
      const sw = 212 / s;
      const sh = 196 / s;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 22, 20, 212, 196);
    }
    const text = first.place || first.title || first.date || '';
    g.fillStyle = '#3b2a26';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 34;
    do g.font = `italic 500 ${size}px "EB Garamond", Georgia, serif`;
    while (g.measureText(text).width > 220 && --size > 18);
    g.fillText(text, 128, 252);
    if (photos.length > 1) {
      g.fillStyle = '#8e1530';
      g.beginPath();
      g.arc(222, 30, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '700 22px Manrope, sans-serif';
      g.fillText(`${photos.length}`, 222, 31);
    }
    tex.needsUpdate = true;
  };
  draw(null);
  const url = first.thumbUrl?.();
  if (url) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = url;
  }
  return tex;
}

/** A compass rose with N on top. */
function drawCompass(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = 'rgba(74, 48, 32, 0.75)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const len = long ? r : r * 0.55;
    g.save();
    g.rotate((i * Math.PI) / 4);
    for (const [side, colour] of [[-1, '#4a3020'], [1, i === 0 ? '#8e1530' : '#c9a66e']]) {
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(0, -len);
      g.lineTo(side * len * 0.16, -len * 0.25);
      g.lineTo(0, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  g.fillStyle = '#4a3020';
  g.font = `600 ${Math.round(r * 0.5)}px "EB Garamond", Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText('N', 0, -r - 4);
  g.restore();
}

/** The title on a paper ribbon. */
function drawTitle(g, text, x, y) {
  g.save();
  g.font = 'italic 500 64px "EB Garamond", Georgia, serif';
  const w = g.measureText(text).width + 90;
  g.fillStyle = 'rgba(40, 20, 10, 0.25)';
  g.fillRect(x - w / 2 + 6, y - 38 + 8, w, 80);
  g.fillStyle = '#f7ecd2';
  g.strokeStyle = '#5a3d26';
  g.lineWidth = 4;
  g.beginPath();
  // A ribbon with notched ends.
  g.moveTo(x - w / 2 - 30, y - 40);
  g.lineTo(x + w / 2 + 30, y - 40);
  g.lineTo(x + w / 2 + 6, y);
  g.lineTo(x + w / 2 + 30, y + 40);
  g.lineTo(x - w / 2 - 30, y + 40);
  g.lineTo(x - w / 2 - 6, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#5a2a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 3);
  g.restore();
}
