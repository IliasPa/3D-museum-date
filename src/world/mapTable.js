/**
 * The memory map: a wooden table in the middle of the hidden last room with a
 * map on top and a pin wherever the photos were taken. Tap a pin to see the
 * photos from there.
 */
import * as THREE from 'three';
import { loadWorld, fitView, drawMap, groupPins, placeOf } from '../map/worldMap.js';
import { textTexture } from './textures.js';

const TOP_W = 2.3;
const TOP_D = 1.45;
const HEIGHT = 0.86;

/** Where the table stands in the last room (finale.js moves the heart back to make room). */
export function mapTableSpot(room) {
  return { x: room.cx, z: room.cz + 0.75 };
}

/**
 * @param room    the hidden last room (from the plan)
 * @param photos  all photos (those with a place get a pin)
 * @param title   written on the table's edge
 * @returns { group, collider, update(dt), hit(raycaster) → photos[] | null }
 */
export function buildMapTable(room, photos, title, colliders) {
  const group = new THREE.Group();
  group.name = 'map-table';
  const { x, z } = mapTableSpot(room);
  group.position.set(x, 0, z);

  const wood = new THREE.MeshLambertMaterial({ color: '#6b4423' });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TOP_W + 0.16, 0.06, TOP_D + 0.16), wood);
  top.position.y = HEIGHT - 0.03;
  group.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, HEIGHT - 0.06, 10), wood);
      leg.position.set(sx * (TOP_W / 2 - 0.1), (HEIGHT - 0.06) / 2, sz * (TOP_D / 2 - 0.1));
      group.add(leg);
    }
  }
  colliders.push({ minX: x - TOP_W / 2 - 0.08, maxX: x + TOP_W / 2 + 0.08, minY: 0, maxY: HEIGHT, minZ: z - TOP_D / 2 - 0.08, maxZ: z + TOP_D / 2 + 0.08 });

  // The map itself: drawn on a canvas once the outlines have downloaded.
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = Math.round((2048 * TOP_D) / TOP_W);
  const g = canvas.getContext('2d');
  g.fillStyle = '#efe2c4';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const map = new THREE.Mesh(new THREE.PlaneGeometry(TOP_W, TOP_D), new THREE.MeshLambertMaterial({ map: tex }));
  map.rotation.x = -Math.PI / 2;
  map.position.y = HEIGHT + 0.002;
  group.add(map);

  // The title on the edge facing the door (south, +z).
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.16),
    new THREE.MeshLambertMaterial({ transparent: true, map: textTexture([{ text: title || 'Our places', font: 'italic 500 70px "EB Garamond", Georgia, serif', color: '#f4e1b8' }], { width: 1100, height: 130 }) }),
  );
  plaque.position.set(0, HEIGHT - 0.03, TOP_D / 2 + 0.081);
  group.add(plaque);

  const pinsGroup = new THREE.Group();
  group.add(pinsGroup);
  const pins = [];
  const view = fitView(photos.map(placeOf), TOP_W / TOP_D, { minSpan: 5 });
  const headMat = new THREE.MeshPhongMaterial({ color: '#c4223f', shininess: 80, specular: '#ffd0da' });
  const needleMat = new THREE.MeshLambertMaterial({ color: '#d8d2c8' });
  for (const pin of groupPins(photos, view, 0.03)) {
    const px = (pin.x - 0.5) * TOP_W;
    const pz = (pin.y - 0.5) * TOP_D;
    if (Math.abs(px) > TOP_W / 2 || Math.abs(pz) > TOP_D / 2) continue;
    const p = new THREE.Group();
    p.position.set(px, HEIGHT, pz);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), needleMat);
    needle.position.y = 0.06;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.min(0.02, pin.photos.length * 0.004), 14, 10), headMat);
    head.position.y = 0.13;
    // A bigger, invisible target so a finger can hit it.
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    target.position.y = 0.11;
    p.add(needle, head, target);
    const place = pin.photos.find((ph) => ph.place)?.place;
    if (place) {
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false,
        map: textTexture([{ text: place, font: '600 44px Manrope, sans-serif', color: '#3b2a26' }], { width: 512, height: 72, padding: 6 }),
      }));
      label.scale.set(0.42, 0.06, 1);
      label.position.y = 0.21;
      p.add(label);
    }
    pinsGroup.add(p);
    pins.push({ group: p, head, target, photos: pin.photos, phase: Math.random() * 6 });
  }

  loadWorld().then((world) => {
    drawMap(g, world, view, canvas.width, canvas.height, { sea: '#bcd6d2', sea2: '#9fc2c0', land: '#f1e3c2', border: '#b8975f', coast: '#6b4423' });
    tex.needsUpdate = true;
  }).catch((err) => console.warn('[map] could not draw the map:', err.message));

  let time = 0;
  return {
    group,
    pins,
    update(dt) {
      time += dt;
      for (const p of pins) p.head.position.y = 0.13 + Math.sin(time * 2 + p.phase) * 0.008;
    },
    /** The photos of the pin under the pointer, if any. */
    hit(raycaster) {
      const h = raycaster.intersectObjects(pins.map((p) => p.target), false)[0];
      return h ? { photos: pins.find((p) => p.target === h.object).photos, distance: h.distance } : null;
    },
  };
}
