/**
 * Wall clocks on the back wall of the first room, under the welcome sign:
 * one for each of you if you live in different time zones (two clocks),
 * otherwise just one. Only the time zone is used (e.g. "Europe/Athens"), so
 * the label says the region's city — never where anyone actually is.
 */
import * as THREE from 'three';
import { textTexture } from './textures.js';

const RADIUS = 0.3;
const Y = 1.15; // under the welcome sign (which ends at ≈ 1.66 m)

/** "Europe/Athens" → "Athens", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityOf(tz) {
  return String(tz).split('/').pop().replace(/_/g, ' ');
}

const formatters = new Map();
/** The time now in a time zone: { h, m, s } (falls back to this device's time). */
export function timeIn(tz, now = new Date()) {
  try {
    if (!formatters.has(tz)) formatters.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }));
    const parts = Object.fromEntries(formatters.get(tz).formatToParts(now).map((p) => [p.type, Number(p.value)]));
    return { h: parts.hour % 24, m: parts.minute, s: parts.second };
  } catch {
    return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
  }
}

/**
 * Who's where, grouped into clocks: people whose clocks show the same time
 * share one. `people`: [{ name, tz }] (you first). Returns at most two
 * [{ tz, names: [] }].
 */
export function clockZones(people) {
  const zones = [];
  const stamp = (tz) => {
    const { h, m } = timeIn(tz);
    return h * 60 + m;
  };
  for (const p of people) {
    if (!p?.tz) continue;
    const same = zones.find((z) => stamp(z.tz) === stamp(p.tz));
    if (same) {
      if (p.name && !same.names.includes(p.name)) same.names.push(p.name);
    } else zones.push({ tz: p.tz, names: p.name ? [p.name] : [] });
  }
  return zones.slice(0, 2);
}

/** Clock face: cream dial, hour marks, numbers. */
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = 256;
  const grad = g.createRadialGradient(r, r * 0.8, 20, r, r, r);
  grad.addColorStop(0, '#fffdf8');
  grad.addColorStop(1, '#f1e6d6');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#5a3a28';
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    g.lineWidth = big ? 9 : 3;
    const r0 = big ? r * 0.8 : r * 0.86;
    g.beginPath();
    g.moveTo(r + Math.sin(a) * r0, r - Math.cos(a) * r0);
    g.lineTo(r + Math.sin(a) * r * 0.92, r - Math.cos(a) * r * 0.92);
    g.stroke();
  }
  g.fillStyle = '#5a3a28';
  g.font = '500 64px "EB Garamond", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const n of [12, 3, 6, 9]) {
    const a = (n / 12) * Math.PI * 2;
    g.fillText(String(n), r + Math.sin(a) * r * 0.64, r - Math.cos(a) * r * 0.64 + 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * @param plan   the floor plan (layout.js)
 * @param zones  clockZones(…) — one or two clocks
 * @param trim   colour of the labels (the first room's sign colour)
 */
export function buildClocks(plan, zones, trim = '#5a3a28') {
  const group = new THREE.Group();
  group.name = 'clocks';
  const first = plan.rooms[0];
  const clocks = [];
  if (!first || !zones.length) return { group, update() {} };
  const face = faceTexture();
  const rimMat = new THREE.MeshPhongMaterial({ color: '#4a2e1f', shininess: 40 });
  const handMat = new THREE.MeshLambertMaterial({ color: '#2b1d17' });
  const secondMat = new THREE.MeshBasicMaterial({ color: '#c4223f' });
  const xs = zones.length === 1 ? [0] : [-1.15, 1.15];

  zones.forEach((zone, i) => {
    const holder = new THREE.Group();
    holder.position.set(first.cx + xs[i], Y, first.z1 - 0.01);
    holder.rotation.y = Math.PI; // the back wall faces north, into the room
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS + 0.035, RADIUS + 0.035, 0.06, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = 0.03;
    const dial = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 40), new THREE.MeshLambertMaterial({ map: face }));
    dial.position.z = 0.061;
    holder.add(rim, dial);
    // Hands pivot at the centre: a box offset along +y inside a pivot group.
    const handOf = (length, width, material, z) => {
      const pivot = new THREE.Group();
      pivot.position.z = z;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.008), material);
      bar.position.y = length / 2 - 0.03;
      pivot.add(bar);
      holder.add(pivot);
      return pivot;
    };
    const hour = handOf(RADIUS * 0.55, 0.026, handMat, 0.068);
    const minute = handOf(RADIUS * 0.8, 0.018, handMat, 0.074);
    const second = handOf(RADIUS * 0.85, 0.007, secondMat, 0.08);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), handMat);
    cap.position.z = 0.085;
    holder.add(cap);

    const label = [zone.names.join(' & '), cityOf(zone.tz)].filter(Boolean).join(' · ');
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.2),
      new THREE.MeshLambertMaterial({ transparent: true, map: textTexture([{ text: label, font: 'italic 500 60px "EB Garamond", Georgia, serif', color: trim }], { width: 1200, height: 160 }) }),
    );
    tag.position.set(0, -RADIUS - 0.17, 0.005);
    holder.add(tag);
    group.add(holder);
    clocks.push({ tz: zone.tz, hour, minute, second });
  });

  let wait = 0;
  const tick = () => {
    const now = new Date();
    for (const c of clocks) {
      const { h, m, s } = timeIn(c.tz, now);
      // Clockwise seen from the front = negative rotation about the clock's +z.
      c.hour.rotation.z = -((h % 12) + m / 60) * (Math.PI / 6);
      c.minute.rotation.z = -(m + s / 60) * (Math.PI / 30);
      c.second.rotation.z = -s * (Math.PI / 30);
    }
  };
  tick();
  return {
    group,
    update(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = 0.25;
      tick();
    },
  };
}
