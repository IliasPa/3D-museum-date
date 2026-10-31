/**
 * The avatar studio's stage: your avatar on a little pedestal, which you can
 * turn by dragging, and which zooms in on what you're changing (face, top,
 * shoes…). It also paints the studio's picture tiles: each option rendered
 * on your own avatar. One small renderer does both; it's thrown away when
 * the studio closes.
 */
import * as THREE from 'three';
import { ProceduralAvatar } from '../player/avatar.js';
import { EmotePlayer } from '../player/emotes.js';
import { encodeLook } from '../player/looks.js';

// Where the big camera looks: [target height, distance, height above the target], × the avatar's height.
const VIEWS = {
  full: [0.68, 3.3, 0.25],
  head: [1.12, 1.9, 0.08],
  torso: [0.72, 2.4, 0.1],
  legs: [0.42, 2.4, 0.15],
  pet: [0.5, 3.6, 0.45],
};

// How each kind of picture tile is framed: [yaw (0 = front), target(avatar) → {x,y,z}, distance, elevation].
const SHOTS = {
  full: [0.35, (a) => ({ x: 0, y: 0.64 * a.h, z: 0 }), 2.45, 0.22],
  face: [0, (a) => a.head, 1.08, 0.04],
  head: [0.3, (a) => ({ ...a.head, y: a.head.y + 0.13 * a.s }), 2.0, 0.12],
  side: [0.95, (a) => a.head, 1.3, 0.06],
  torso: [0.25, (a) => ({ x: 0, y: 0.6 * a.h, z: 0 }), 1.85, 0.08],
  neck: [0.2, (a) => ({ x: 0, y: 0.69 * a.h, z: 0.05 }), 1.2, 0.05],
  legs: [0.3, (a) => ({ x: 0, y: 0.3 * a.h, z: 0 }), 1.75, 0.15],
  feet: [0.45, () => ({ x: 0, y: 0.07, z: 0.04 }), 0.95, 0.35],
  back: [2.6, (a) => ({ x: 0, y: 0.6 * a.h, z: 0 }), 2.5, 0.25],
  hand: [0.55, (a) => ({ x: 0.1, y: 0.56 * a.h, z: 0.1 }), 1.75, 0.12],
  pet: [0.75, () => ({ x: 0.48, y: 0.2, z: -0.32 }), 1.25, 0.2],
};
// Things that can't be seen in a close-up are left out (cheaper, and no stray balloon in the picture).
const CLOSE_UPS = new Set(['face', 'head', 'side', 'torso', 'neck', 'legs', 'feet']);

export class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.emotes = new EmotePlayer();
    const none = () => {};
    this.ctx = { fx: { bubble: none, emoji: none, rainbow: none }, hearts: null, position: new THREE.Vector3(), facing: 0, partner: null };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.#light(this.scene);
    // A round pedestal to stand on.
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.08, 48), new THREE.MeshLambertMaterial({ color: '#fff3ee' }));
    pedestal.position.y = -0.04;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.012, 6, 48), new THREE.MeshLambertMaterial({ color: '#e7b9b0' }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.005;
    this.scene.add(pedestal, rim);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.view = { name: 'full', target: new THREE.Vector3(0, 0.68, 0), distance: 3.3, lift: 0.25 };
    this.cam = { target: this.view.target.clone(), distance: 3.3, lift: 0.25 }; // eased towards this.view
    this.avatar = null;
    this.time = 0;
    this.yaw = 0.35; // turntable angle
    this.spin = 0; // drag inertia
    this.lastDrag = -10;

    // Picture tiles.
    this.thumbScene = new THREE.Scene();
    this.#light(this.thumbScene);
    this.thumbCamera = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.jobs = [];
    this.cache = new Map(); // key → small canvas
    this.#bindDrag();
  }

  #light(scene) {
    scene.add(new THREE.HemisphereLight('#fff3e3', '#9a7a66', 2.3));
    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight('#ffd6e0', 0.9);
    rim.position.set(-2, 1.5, -2.5);
    scene.add(key, rim);
  }

  /** Drag (mouse or finger) to turn the avatar around. Vertical swipes still scroll the page. */
  #bindDrag() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const now = performance.now();
      this.yaw += dx * 0.012;
      this.spin = (dx * 0.012) / Math.max(0.008, (now - drag.t) / 1000);
      drag.x = e.clientX;
      drag.t = now;
      this.lastDrag = this.time;
    });
    const end = (e) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** Show this look (and strike a little pose, `emote` = an action letter). */
  setLook(look, emote = 'V') {
    if (this.avatar) {
      this.turntable.remove(this.avatar.root);
      dispose(this.avatar.root);
    }
    this.avatar = new ProceduralAvatar(look);
    if (this.avatar.pet) this.avatar.pet.follow = false; // stays on the pedestal
    this.turntable.add(this.avatar.root);
    this.emotes.play(emote);
    this.setView(this.view.name);
  }

  /** Zoom in on part of the avatar: 'full', 'head', 'torso', 'legs' or 'pet'. */
  setView(name) {
    const [y, distance, lift] = VIEWS[name] ?? VIEWS.full;
    const h = this.avatar?.look.height ?? 1;
    const head = name === 'head' && this.avatar ? (this.avatar.look.headSize - 1) * 0.3 : 0;
    this.view.name = name;
    this.view.target.set(name === 'pet' ? 0.2 : 0, y * h + head, 0);
    this.view.distance = distance * (name === 'head' ? this.avatar?.look.headSize ?? 1 : 1);
    this.view.lift = lift;
    if (name === 'pet') this.yaw = -0.7; // turn so the pet (behind, to the left) comes into view
    if (name === 'full' || name === 'pet') this.lastDrag = -10;
  }

  /**
   * Paint `canvas` with this look, framed as `shot` (see SHOTS). Tiles are
   * painted a few per frame; asking again for the same canvas replaces the
   * earlier request.
   */
  thumb(look, shot, canvas) {
    const job = { look: CLOSE_UPS.has(shot) ? { ...look, pet: 'none', hold: 'none', back: 'none', tail: 'none' } : look, shot, canvas };
    job.key = `${shot}|${encodeLook(job.look)}`;
    const cached = this.cache.get(job.key);
    if (cached) return paint(canvas, cached);
    this.jobs = this.jobs.filter((j) => j.canvas !== canvas);
    this.jobs.push(job);
  }

  start() {
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.time += dt;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (!w || !h) return;
      this.#renderThumbs();

      // The turntable: inertia after a drag, then (after a while) a gentle sway.
      this.yaw += this.spin * dt;
      this.spin *= Math.exp(-dt * 4);
      if (this.time - this.lastDrag > 4) this.yaw += (Math.sin(this.time * 0.6) * 0.45 + (this.view.name === 'pet' ? -0.7 : 0.2) - this.yaw) * Math.min(1, dt * 0.8);
      this.turntable.rotation.y = this.yaw;
      if (this.avatar) {
        this.ctx.avatar = this.avatar;
        this.avatar.update(dt, 0, this.emotes.update(dt, this.ctx, false));
      }

      // Ease the camera towards the chosen view.
      const k = 1 - Math.exp(-dt * 6);
      this.cam.target.lerp(this.view.target, k);
      this.cam.distance += (this.view.distance - this.cam.distance) * k;
      this.cam.lift += (this.view.lift - this.cam.lift) * k;
      const fit = Math.max(1, 0.85 / this.camera.aspect); // narrow canvases: step back a little
      this.camera.position.set(0, this.cam.target.y + this.cam.lift * this.cam.distance * fit, this.cam.distance * fit);
      this.camera.lookAt(this.cam.target.x, this.cam.target.y, 0);

      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Paint a few waiting picture tiles (at most ~8 ms per frame), in a corner of this canvas. */
  #renderThumbs() {
    const until = performance.now() + 8;
    while (this.jobs.length && performance.now() < until) {
      const job = this.jobs.shift();
      if (job.canvas.isConnected) this.#renderThumb(job);
    }
  }

  #renderThumb({ look, shot, canvas, key }) {
    const r = this.renderer;
    const ratio = r.getPixelRatio();
    const size = Math.min(canvas.width / ratio, this.canvas.clientWidth, this.canvas.clientHeight);
    if (size < 8) return;
    const avatar = new ProceduralAvatar(look);
    if (avatar.pet) avatar.pet.follow = false;
    avatar.nextBlink = 99;
    avatar.update(1 / 60, 0, null);
    avatar.root.updateMatrixWorld(true);
    this.thumbScene.add(avatar.root);
    const [yaw, aim, distance, lift] = SHOTS[shot] ?? SHOTS.full;
    const s = avatar.look.headSize ?? 1;
    const target = aim({ h: avatar.look.height ?? 1, s, head: avatar.head.getWorldPosition(new THREE.Vector3()) });
    const d = distance * (['face', 'head', 'side'].includes(shot) ? s : 1);
    this.thumbCamera.position.set(target.x + Math.sin(yaw) * d, target.y + lift * d, target.z + Math.cos(yaw) * d);
    this.thumbCamera.lookAt(target.x, target.y, target.z);

    r.setScissorTest(true);
    r.setViewport(0, 0, size, size);
    r.setScissor(0, 0, size, size);
    r.clear();
    r.render(this.thumbScene, this.thumbCamera);
    // Copy the corner (WebGL's origin is bottom-left) into a small cached canvas, then onto the tile.
    const px = Math.round(size * ratio);
    const copy = document.createElement('canvas');
    copy.width = copy.height = px;
    copy.getContext('2d').drawImage(r.domElement, 0, r.domElement.height - px, px, px, 0, 0, px, px);
    this.cache.set(key, copy);
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    paint(canvas, copy);
    this.thumbScene.remove(avatar.root);
    dispose(avatar.root);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    if (this.avatar) dispose(this.avatar.root);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.jobs = [];
    this.cache.clear();
  }
}

function paint(canvas, image) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas.classList.add('painted');
}

/** Free an avatar's GPU memory (prints and other shared textures are kept). */
function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
  });
}
