/**
 * Little visual effects for the avatars' actions: speech bubbles above heads
 * ("Meow! 🐱"), emoji particles (tears, a blown kiss) and a rainbow.
 * Emoji are drawn with the device's own emoji font, so they look native on
 * iPhone, Android and Windows alike.
 */
import * as THREE from 'three';
import { radialGlowTexture } from './textures.js';

const textures = new Map();
const FIREWORK_COLOURS = ['#ff5c8a', '#ffd166', '#7bdff2', '#b8f2a6', '#ffffff', '#c792ea', '#ff9e5e'].map((c) => new THREE.Color(c));

/** A canvas texture of an emoji, or of a short text in a speech bubble. */
function labelTexture(content) {
  if (textures.has(content)) return textures.get(content);
  const isText = /[a-z]/i.test(content);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (isText) {
    c.width = 320;
    c.height = 128;
    g.font = '700 46px Manrope, system-ui, sans-serif';
    const w = Math.min(300, g.measureText(content).width + 48);
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.roundRect((320 - w) / 2, 10, w, 86, 40);
    g.moveTo(150, 94);
    g.lineTo(160, 118);
    g.lineTo(172, 94);
    g.fill();
    g.fillStyle = '#8e1530';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(content, 160, 55);
  } else {
    c.width = c.height = 128;
    g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(content, 64, 72);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(content, { tex, aspect: c.width / c.height });
  return textures.get(content);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  /** A bubble that floats above an avatar's head for a moment. */
  bubble(anchor, content, duration = 1.8) {
    const { tex, aspect } = labelTexture(content);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const h = aspect > 1.5 ? 0.3 : 0.38;
    sprite.scale.set(h * aspect, h, 1);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.items.push({ sprite, anchor, age: 0, life: duration, kind: 'bubble', h, aspect });
  }

  /**
   * A floating emoji particle.
   * @param pos  world position (Vector3, copied)
   * @param opts { vx, vy, vz, gravity, life, size, spin }
   */
  emoji(pos, content, opts = {}) {
    const { tex, aspect } = labelTexture(content);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const size = opts.size ?? 0.16;
    sprite.scale.set(size * aspect, size, 1);
    sprite.position.copy(pos);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.items.push({
      sprite, kind: 'particle', age: 0, life: opts.life ?? 1.4, size, aspect,
      v: new THREE.Vector3(opts.vx ?? 0, opts.vy ?? 0.4, opts.vz ?? 0), gravity: opts.gravity ?? 0,
    });
  }

  /**
   * A rainbow thrown up from two hands at `pos` (their height), arching across
   * the direction `yaw`: it springs out of the hands, both ends drawing
   * outward and up to meet at the top, while it grows and rises.
   */
  rainbow(pos, yaw) {
    const group = new THREE.Group();
    const colours = ['#ff5a5f', '#ff9f43', '#feca57', '#1dd1a1', '#54a0ff', '#a55eea'];
    const bands = colours.map((c, i) => {
      const band = new THREE.Mesh(
        arcRibbon(1 - (i + 1) * 0.075, 1 - i * 0.075, RAINBOW_SEGMENTS),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }),
      );
      band.geometry.setDrawRange(0, 0);
      group.add(band);
      return band;
    });
    group.position.copy(pos);
    group.rotation.y = yaw;
    group.scale.setScalar(0.38); // the ends start at the hands
    this.scene.add(group);
    this.items.push({ sprite: group, bands, kind: 'rainbow', age: 0, life: 3.4 });
  }

  /**
   * Fireworks (small ones — we're indoors): a few bursts of sparks under the
   * ceiling above `pos`, one after another.
   */
  fireworks(pos, { reducedMotion = false } = {}) {
    const count = reducedMotion ? 2 : 7;
    for (let i = 0; i < count; i++) {
      this.items.push({
        kind: 'pending', age: -i * 0.45 - Math.random() * 0.2, life: 0,
        at: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 3, 2.7 + Math.random() * 0.9, pos.z + (Math.random() - 0.5) * 3),
        reducedMotion,
      });
    }
  }

  #burst(at, reducedMotion) {
    const n = reducedMotion ? 30 : 70;
    const colour = FIREWORK_COLOURS[Math.floor(Math.random() * FIREWORK_COLOURS.length)];
    const second = FIREWORK_COLOURS[Math.floor(Math.random() * FIREWORK_COLOURS.length)];
    const positions = new Float32Array(n * 3);
    const colours = new Float32Array(n * 3);
    const velocities = [];
    for (let i = 0; i < n; i++) {
      // Evenly spread directions on a sphere, slightly random speeds.
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      const speed = (reducedMotion ? 0.9 : 1.5) * (0.85 + Math.random() * 0.3);
      velocities.push(new THREE.Vector3(Math.cos(a) * r * speed, y * speed, Math.sin(a) * r * speed));
      positions.set([at.x, at.y, at.z], i * 3);
      (i % 3 ? colour : second).toArray(colours, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, map: radialGlowTexture(), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    points.frustumCulled = false;
    points.renderOrder = 6;
    this.scene.add(points);
    this.items.push({ sprite: points, kind: 'burst', age: 0, life: 1.6, velocities, origin: at.clone() });
  }

  update(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.kind === 'pending') {
        if (it.age >= 0) {
          this.items.splice(i, 1);
          this.#burst(it.at, it.reducedMotion);
        }
        continue;
      }
      const t = it.age / it.life;
      if (t >= 1) {
        this.scene.remove(it.sprite);
        it.sprite.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        this.items.splice(i, 1);
        continue;
      }
      if (it.kind === 'bubble') {
        it.anchor.getWorldPosition(tmp);
        const pop = Math.min(1, it.age / 0.18);
        it.sprite.position.set(tmp.x, tmp.y + 0.55 + pop * 0.1 + it.age * 0.05, tmp.z);
        it.sprite.scale.set(it.h * it.aspect * (0.6 + 0.4 * pop), it.h * (0.6 + 0.4 * pop), 1);
        it.sprite.material.opacity = Math.min(1, (1 - t) * 4);
      } else if (it.kind === 'particle') {
        it.v.y -= it.gravity * dt;
        it.sprite.position.addScaledVector(it.v, dt);
        it.sprite.material.opacity = Math.min(1, (1 - t) * 3, it.age * 8);
      } else if (it.kind === 'burst') {
        // Sparks fly out, slow down, droop and fade.
        const pos = it.sprite.geometry.attributes.position;
        const travel = 1 - Math.exp(-it.age * 2.2);
        it.velocities.forEach((v, k) => {
          pos.setXYZ(k, it.origin.x + v.x * travel, it.origin.y + v.y * travel - 0.6 * it.age * it.age, it.origin.z + v.z * travel);
        });
        pos.needsUpdate = true;
        it.sprite.material.opacity = Math.min(1, (1 - t) * 2.2);
        it.sprite.material.size = 0.12 * (1 - 0.4 * t);
      } else if (it.kind === 'rainbow') {
        const easeOut = (x) => 1 - (1 - Math.min(1, x)) ** 3;
        const drawn = Math.ceil(easeOut(it.age / 0.55) * (RAINBOW_SEGMENTS / 2));
        const fade = Math.min(1, (1 - t) * 3);
        for (const band of it.bands) {
          band.geometry.setDrawRange(0, drawn * 12);
          band.material.opacity = 0.92 * fade;
        }
        it.sprite.scale.setScalar(0.38 + 0.95 * easeOut(it.age / 1.1));
        it.sprite.position.y += dt * 0.12;
      }
    }
  }
}

const RAINBOW_SEGMENTS = 48;

/**
 * A flat half-ring (one colour of the rainbow) whose triangles are ordered
 * from both ends towards the top — so drawing more of them makes the arc grow
 * out of both hands at once.
 */
function arcRibbon(inner, outer, segments) {
  const positions = [];
  for (let k = 0; k <= segments; k++) {
    const a = (Math.PI * k) / segments;
    positions.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a) * outer, Math.sin(a) * outer, 0);
  }
  const quad = (k) => [2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2];
  const index = [];
  for (let k = 0; k < segments / 2; k++) index.push(...quad(k), ...quad(segments - 1 - k));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  return geo;
}
