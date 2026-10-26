/**
 * Video screens. A video hangs on the wall in front of a bench (layout.js
 * decides where) and plays only while you sit on that bench — with sound,
 * because sitting down is a tap/keypress (phones only allow sound then).
 */
import * as THREE from 'three';
import { radialGlowTexture, textTexture } from './textures.js';

export function buildScreens(plan) {
  const group = new THREE.Group();
  group.name = 'screens';
  const items = [];
  const glow = radialGlowTexture();
  const bezelMat = new THREE.MeshPhongMaterial({ color: '#1c1a1b', shininess: 60, specular: 0x333333 });
  const loader = new THREE.TextureLoader();

  for (const bench of plan.benches) {
    if (!bench.screen) continue;
    const s = bench.screen;
    const holder = new THREE.Group();
    holder.position.set(s.x, s.y, s.z);
    holder.rotation.y = s.rotationY;

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(s.width + 0.14, s.height + 0.14, 0.06), bezelMat);
    bezel.position.z = 0.03;
    const material = new THREE.MeshBasicMaterial({ color: '#111111', toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), material);
    screen.position.z = 0.062;
    const wallGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(s.width * 1.8, s.height * 2.1),
      new THREE.MeshBasicMaterial({ map: glow, color: '#ffcf96', opacity: 0.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    wallGlow.position.set(0, s.height * 0.15, 0.004);
    wallGlow.renderOrder = 1;
    // A small sign under the screen.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.2),
      new THREE.MeshLambertMaterial({
        transparent: true,
        map: textTexture([{ text: `▶  ${bench.video.title || 'A little film'} · sit on the bench to watch`, font: '600 34px Manrope, sans-serif', color: '#3b2a26' }], { width: 1280, height: 160 }),
      }),
    );
    sign.position.set(0, -s.height / 2 - 0.25, 0.01);
    holder.add(wallGlow, bezel, screen, sign);
    group.add(holder);

    const item = { bench, video: bench.video, material, poster: null, url: null, loading: null };
    /** Download the film (once); `item.url` is set when it's here. */
    item.load = () => (item.loading ??= item.video.url?.()
      .then((url) => (item.url = url))
      .catch((err) => {
        item.loading = null; // try again next time
        console.warn('[video] could not load:', err.message);
      }));
    Promise.resolve(bench.video.posterUrl).then((url) => (url ? loader.loadAsync(url) : null)).then((tex) => {
      if (!tex) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      item.poster = tex;
      if (!item.playing) {
        material.map = tex;
        material.color.set('#ffffff');
        material.needsUpdate = true;
      }
    }).catch(() => {});
    items.push(item);
  }

  /**
   * Download the videos of a room — and of the next one — in the background,
   * so they're ready when someone sits down (but a long film in the last room
   * isn't downloaded by everyone who only looks at the first).
   */
  function preload(roomIndex) {
    for (const item of items) if (item.bench.roomIndex === roomIndex || item.bench.roomIndex === roomIndex + 1) item.load();
  }

  return { group, items, preload };
}

/** Plays one video at a time onto its screen. */
export class VideoPlayer {
  constructor() {
    this.el = null;
    this.item = null;
    this.texture = null;
    this.mutedFallback = false;
    this.onChange = () => {}; // (playing: boolean, info) — e.g. to pause the music
  }

  get playing() {
    return Boolean(this.item);
  }

  /** Call this directly inside the tap/key that made you sit (phones need that for sound). */
  play(item) {
    this.stop();
    this.item = item;
    item.playing = true;
    const el = (this.el = document.createElement('video'));
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.loop = true;
    el.preload = 'auto';
    const start = () => {
      if (this.item !== item) return;
      el.src = item.url;
      el.play().catch(() => {
        // Sound not allowed right now: play silently; a tap turns the sound on.
        el.muted = true;
        this.mutedFallback = true;
        el.play().catch(() => {});
        this.onChange(true, { muted: true });
      });
      this.texture = new THREE.VideoTexture(el);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      item.material.map = this.texture;
      item.material.color.set('#ffffff');
      item.material.needsUpdate = true;
    };
    if (item.url) start();
    else {
      item.load();
      // Still downloading: start as soon as it's here.
      const wait = setInterval(() => {
        if (this.item !== item) clearInterval(wait);
        else if (item.url) {
          clearInterval(wait);
          start();
        }
      }, 200);
    }
    this.onChange(true, { muted: false, loading: !item.url });
  }

  /** A tap after a silent start: turn the sound on. */
  unmute() {
    if (!this.el || !this.mutedFallback) return;
    this.el.muted = false;
    this.mutedFallback = false;
    this.el.play().catch(() => {});
    this.onChange(true, { muted: false });
  }

  stop() {
    const item = this.item;
    if (!item) return;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.texture?.dispose();
    item.material.map = item.poster;
    if (!item.poster) item.material.color.set('#111111');
    item.material.needsUpdate = true;
    item.playing = false;
    this.item = null;
    this.el = null;
    this.texture = null;
    this.mutedFallback = false;
    this.onChange(false, {});
  }
}
