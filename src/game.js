/**
 * The game: owns the renderer, scene, avatar, camera and the main loop.
 * It knows nothing about HTML — it reports what happens through callbacks
 * (onRoomChange, onFocusChange, onFinaleNear, onOpenPhoto) and main.js
 * connects those to the on-screen UI.
 */
import * as THREE from 'three';
import { planMuseum } from './world/layout.js';
import { buildMuseum } from './world/museum.js';
import { buildFrames } from './world/frames.js';
import { buildFinale } from './world/finale.js';
import { buildDust } from './world/dust.js';
import { raycastBoxes } from './world/collision.js';
import { createAvatar } from './player/avatar.js';
import { PlayerController } from './player/controller.js';
import { CameraRig } from './player/cameraRig.js';
import { Input } from './input/input.js';
import { AdaptiveResolution } from './adaptiveResolution.js';

export class Game {
  /** Use `await Game.create(...)` (building the avatar may load a file). */
  static async create(canvas, joystickEl, config, photos, onPhotoProgress) {
    const game = new Game(canvas, joystickEl, config, photos, onPhotoProgress);
    await game.#initAvatar();
    return game;
  }

  constructor(canvas, joystickEl, config, photos, onPhotoProgress) {
    this.config = config;
    this.canvas = canvas;

    // Callbacks for the UI (set by main.js).
    this.onRoomChange = () => {};
    this.onFocusChange = () => {};
    this.onFinaleNear = () => {};
    this.onOpenPhoto = () => {};

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.resolution = new AdaptiveResolution(this.renderer, config.graphics.maxPixelRatio, config.graphics.adaptiveResolution);
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault()); // let three.js restore it

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1214');
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.05, 120);

    // ── World ──
    this.plan = planMuseum(config, photos);
    const museum = buildMuseum(this.plan, config, this.renderer);
    this.colliders = museum.colliders;
    this.scene.add(museum.group);

    this.frames = buildFrames(this.plan, config, this.renderer, onPhotoProgress);
    this.scene.add(this.frames.group);

    this.finale = config.finale.enabled ? buildFinale(this.plan, config.finale, this.colliders) : null;
    if (this.finale) this.scene.add(this.finale.group);

    this.dust = buildDust(this.plan);
    this.scene.add(this.dust.object);

    // ── Camera & input ──
    this.rig = new CameraRig(this.camera, config.camera);
    this.input = new Input(canvas, joystickEl, config);
    this.input.onTap = (x, y) => this.#handleTap(x, y);
    this.input.onInteract = () => this.focus && this.onOpenPhoto(this.focus);

    this.focus = null; // the photo item we're standing in front of
    this.roomIndex = -1;
    this.finaleNear = false;
    this.started = false;
    this.paused = false; // true while a photo is open full-screen
    this.time = 0;
    this.raycaster = new THREE.Raycaster();

    this.#resize();
    addEventListener('resize', () => this.#resize());
    window.visualViewport?.addEventListener('resize', () => this.#resize());
  }

  async #initAvatar() {
    this.avatar = await createAvatar(this.config);
    this.avatar.root.position.set(this.plan.start.x, 0, this.plan.start.z);
    this.scene.add(this.avatar.root);
    this.controller = new PlayerController(this.avatar, this.colliders, this.config.controls);
    // Intro: start high above, swoop down behind the avatar after "Enter".
    this.rig.pitch = 0.62;
    this.rig.distance = this.config.camera.maxDistance;
    this.rig.current = this.rig.distance;
  }

  /** Start rendering (call right away — the start screen shows the museum behind it). */
  run() {
    const timer = new THREE.Timer();
    timer.connect(document); // no giant time jump after switching tabs
    this.renderer.setAnimationLoop((now) => {
      timer.update(now);
      this.#tick(Math.min(timer.getDelta(), 1 / 10)); // keeps normal speed down to 10 fps
    });
  }

  /** Called when the player presses "Enter". */
  start() {
    this.started = true;
    this.input.setEnabled(true);
    this.intro = 0;
    this.introFrom = { pitch: this.rig.pitch, distance: this.rig.distance, yaw: this.rig.yaw };
  }

  /** Freeze walking while a full-screen view is open. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) this.input.reset();
    this.input.setEnabled(this.started && !paused);
  }

  #tick(dt) {
    this.time += dt;
    this.input.update();

    if (!this.started) {
      // Before "Enter": slowly sway the camera around the avatar.
      this.rig.yaw = Math.sin(this.time * 0.18) * 0.7;
    } else if (this.intro < 1) {
      // Swoop into the normal third-person view.
      this.intro = Math.min(1, this.intro + dt / 1.6);
      const e = 1 - (1 - this.intro) ** 3;
      const c = this.config.camera;
      this.rig.pitch = this.introFrom.pitch + (c.pitch - this.introFrom.pitch) * e;
      this.rig.distance = this.introFrom.distance + (c.distance - this.introFrom.distance) * e;
      this.rig.yaw = this.introFrom.yaw * (1 - e);
    }

    const look = this.input.consumeLook();
    if (look.x || look.y) this.rig.rotate(look.x, look.y);
    const zoom = this.input.consumeZoom();
    if (zoom) this.rig.zoom(zoom);

    this.controller.update(dt, this.input.move, this.input.run, this.rig.yaw);
    const pos = this.avatar.root.position;
    this.rig.update(dt, pos, this.colliders);

    this.#updateRoom(pos);
    this.#updateFocus(pos);
    this.frames.update(dt, this.focus);
    this.dust.update(dt, this.renderer.getPixelRatio());
    if (this.finale) {
      const near = this.finale.update(dt, pos) && this.started;
      if (near !== this.finaleNear) {
        this.finaleNear = near;
        this.onFinaleNear(near);
      }
    }

    if (this.resolution.update(dt)) this.#resize();
    if (!this.paused) this.renderer.render(this.scene, this.camera);
  }

  /** Which room is the avatar in? (Inside a doorway: keep the previous one.) */
  #updateRoom(pos) {
    if (!this.started) return;
    const index = this.plan.rooms.findIndex((r) => pos.x > r.x0 && pos.x < r.x1 && pos.z > r.z0 && pos.z < r.z1);
    if (index !== -1 && index !== this.roomIndex) {
      this.roomIndex = index;
      this.onRoomChange(this.plan.rooms[index], index);
    }
  }

  /** Find the photo the avatar is standing in front of. */
  #updateFocus(pos) {
    const range = this.config.frames.showOverlayWithin;
    let best = null;
    let bestDist = Infinity;
    for (const item of this.frames.items) {
      const dx = pos.x - item.x;
      const dz = pos.z - item.z;
      const inFront = dx * item.nx + dz * item.nz; // distance out from the wall
      const sideways = Math.abs(dx * item.nz - dz * item.nx);
      if (inFront < 0.2 || sideways > item.outerW / 2 + 1.0) continue;
      const dist = Math.hypot(dx, dz);
      // Stick with the current photo a little longer to avoid flicker.
      const limit = item === this.focus ? range + 0.5 : range;
      const score = item === this.focus ? dist - 0.3 : dist;
      if (dist < limit && score < bestDist) {
        best = item;
        bestDist = score;
      }
    }
    if (!this.started) best = null;
    if (best !== this.focus) {
      this.focus = best;
      this.onFocusChange(best);
    }
  }

  /** Tap / click: open the photo under the pointer (if no wall is in the way). */
  #handleTap(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.frames.items.map((i) => i.mesh), false)[0];
    if (!hit || hit.distance > 14) return;
    const wall = raycastBoxes(this.raycaster.ray.origin, this.raycaster.ray.direction, hit.distance, this.colliders);
    if (wall < hit.distance - 0.05) return;
    this.onOpenPhoto(this.frames.items[hit.object.userData.frameIndex]);
  }

  /** Photos in the same room as `item`, in walking order (for prev/next in the viewer). */
  photosInRoomOf(item) {
    return this.frames.items.filter((i) => i.roomIndex === item.roomIndex);
  }

  #resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones: widen the view a little so the walls aren't cramped.
    this.camera.fov = this.config.camera.fov + (w < h ? 12 : 0);
    this.camera.updateProjectionMatrix();
  }
}
