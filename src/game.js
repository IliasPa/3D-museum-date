/**
 * The game: owns the renderer, scene, avatars, camera and the main loop.
 * It knows nothing about HTML or the database — it reports what happens
 * through callbacks (onRoomChange, onFocusChange, onFinaleNear, onOpenPhoto,
 * onHint, onVideoChange) and main.js connects those to the screen and Firebase.
 *
 *   const game = new Game(canvas, joystick, CONFIG);
 *   await game.setMuseum(config, photos, look, onProgress, videos);  // build (or rebuild)
 *   game.run();                                                       // start drawing
 *   game.start();                                                     // after "Enter"
 *   game.performAction('W');                                          // A–Z actions
 */
import * as THREE from 'three';
import { planMuseum } from './world/layout.js';
import { buildMuseum } from './world/museum.js';
import { buildFrames } from './world/frames.js';
import { buildFinale } from './world/finale.js';
import { buildDust } from './world/dust.js';
import { buildScreens, VideoPlayer } from './world/videos.js';
import { HeartBursts } from './world/heartBursts.js';
import { Effects } from './world/effects.js';
import { raycastBoxes } from './world/collision.js';
import { createAvatar } from './player/avatar.js';
import { PlayerController } from './player/controller.js';
import { CameraRig } from './player/cameraRig.js';
import { RemoteAvatars } from './player/remoteAvatars.js';
import { EmotePlayer, EMOTES } from './player/emotes.js';
import { Input } from './input/input.js';
import { AdaptiveResolution } from './adaptiveResolution.js';

const CLOSE_TOGETHER = 1.6; // metres — closer than this, hearts float up between you
const CLOSE_FOR_HUG = 1.6; // hug / kiss / tickle reach
const SIT_REACH = 1.9; // how close to a bench seat you must be to sit down

export class Game {
  constructor(canvas, joystickEl, config) {
    this.config = config;
    this.canvas = canvas;

    // Callbacks for the UI (set by main.js).
    this.onRoomChange = () => {};
    this.onFocusChange = () => {};
    this.onFinaleNear = () => {};
    this.onOpenPhoto = () => {};
    this.onHint = () => {}; // (text) — short messages like "Walk up to a bench"
    this.onVideoChange = () => {}; // (playing, { muted }) — e.g. pause the music

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.resolution = new AdaptiveResolution(this.renderer, config.graphics.maxPixelRatio, config.graphics.adaptiveResolution);
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault()); // let three.js restore it

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1214');
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.05, 160);

    // ── Things that live across museums ──
    this.rig = new CameraRig(this.camera, config.camera);
    this.input = new Input(canvas, joystickEl, config);
    this.input.onTap = (x, y) => this.#handleTap(x, y);
    this.input.onInteract = () => this.focus && this.onOpenPhoto(this.focus);
    this.input.onAction = (key) => this.performAction(key);
    this.remotes = new RemoteAvatars(this.scene);
    this.hearts = new HeartBursts(this.scene);
    this.fx = new Effects(this.scene);
    this.remotes.onEmote = (x, y, z) => this.hearts.burst(x, y, z, 10);
    this.remotes.onTargeted = (reaction, fromUid) => this.#react(reaction, fromUid);
    this.localEmotes = new EmotePlayer();
    this.actionNonce = 0; // changes on every new action, so the other screen knows to play it
    this.actionTarget = '';
    this.video = new VideoPlayer();
    this.video.onChange = (playing, info) => this.onVideoChange(playing, info);
    this.raycaster = new THREE.Raycaster();

    this.world = null; // everything belonging to the current museum
    this.started = false;
    this.paused = false; // true while a photo is open full-screen
    this.holdFrames = false; // true while loading: don't draw, give slow phones all their power
    this.time = 0;
    this.closeTimer = 0;

    this.#resize();
    addEventListener('resize', () => this.#resize());
    window.visualViewport?.addEventListener('resize', () => this.#resize());
  }

  /**
   * Build (or rebuild) the museum.
   * @param config  settings for this museum (museumConfig.js)
   * @param photos  [{ width, height, color, room, title, date, caption, url?(size) }]
   * @param look    the visitor's avatar look (looks.js)
   * @param onPhotoProgress (loaded, total) while photos download
   * @param videos  [{ room, width, height, title, posterUrl, url() }]
   */
  async setMuseum(config, photos, look, onPhotoProgress = () => {}, videos = []) {
    this.config = config;
    this.#standUp();
    if (this.world) {
      this.scene.remove(this.world);
      disposeObject(this.world);
    }
    this.remotes.clear();
    this.world = new THREE.Group();

    this.plan = planMuseum(config, photos, videos);
    const museum = buildMuseum(this.plan, config, this.renderer);
    this.colliders = museum.colliders;
    this.world.add(museum.group);

    this.screens = buildScreens(this.plan);
    this.world.add(this.screens.group);
    // Videos download after the photos, so the walls fill up first.
    let preloaded = false;
    const preload = () => !preloaded && (preloaded = true) && this.screens.preload();
    this.frames = buildFrames(this.plan, config, this.renderer, (loaded, total) => {
      onPhotoProgress(loaded, total);
      if (loaded >= total) preload();
    });
    this.world.add(this.frames.group);

    this.finale = config.finale.enabled ? buildFinale(this.plan, config.finale, this.colliders) : null;
    if (this.finale) this.world.add(this.finale.group);

    this.dust = buildDust(this.plan);
    this.world.add(this.dust.object);
    this.scene.add(this.world);

    const avatar = await createAvatar(config, look);
    this.#swapAvatar(avatar);
    this.controller = new PlayerController(avatar, this.colliders, config.controls, this.plan.start);
    this.controller.onStandRequest = () => this.#standUp();

    this.focus = null;
    this.roomIndex = -1;
    this.finaleNear = false;
    // Intro: start high above, swoop down behind the avatar after "Enter".
    this.rig.initialized = false;
    this.rig.yaw = 0;
    this.rig.pitch = 0.62;
    this.rig.distance = config.camera.maxDistance;
    this.rig.current = this.rig.distance;
  }

  /** Change your avatar's look (keeps its position). */
  async setLook(look) {
    const avatar = await createAvatar(this.config, look);
    this.#swapAvatar(avatar);
    this.controller.avatar = avatar;
  }

  #swapAvatar(avatar) {
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      disposeObject(this.avatar.root);
    }
    this.avatar = avatar;
    this.scene.add(avatar.root);
  }

  /** Your Firebase uid (so actions aimed at you can be recognised). */
  setSelfId(uid) {
    this.remotes.selfId = uid;
  }

  /** Start rendering (call right away — the start screen shows the museum behind it). */
  run() {
    const timer = new THREE.Timer();
    timer.connect(document); // no giant time jump after switching tabs
    this.renderer.setAnimationLoop((now) => {
      timer.update(now);
      const dt = Math.min(timer.getDelta(), 1 / 10); // keeps normal speed down to 10 fps
      if (this.world && !this.holdFrames) this.#tick(dt);
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

  // ── Actions (A–Z) ─────────────────────────────────────────────────────
  /**
   * Play an action by its letter. Hug, Kiss and Tickle reach the other person
   * when they're close (Hug and Kiss: facing each other); otherwise you do a
   * heart with your hands, blow a kiss, or tickle the air. S sits on (or gets
   * up from) a nearby bench.
   */
  performAction(key) {
    key = String(key).toUpperCase();
    if (!this.started || this.paused || !EMOTES[key]) return;
    if (this.localEmotes.locked) return; // let the current one finish (flips, falls…)
    if (key === 'S') return this.#toggleSit();
    if (this.controller.seat && !EMOTES[key].upper) this.#standUp(); // full-body actions need standing

    const partner = this.#nearestPartner();
    const close = partner && partner.dist < CLOSE_FOR_HUG;
    let id = key;
    let target = '';
    if (key === 'H') close && partner.facingEachOther ? (target = partner.uid) : (id = 'heart');
    else if (key === 'K') close && partner.facingEachOther ? (target = partner.uid) : (id = 'blowkiss');
    else if (key === 'T') close ? (target = partner.uid) : (id = 'tickleair');
    this.#playLocal(id, target);
  }

  #playLocal(id, target = '') {
    if (!this.localEmotes.play(id, { target })) return;
    this.actionNonce++;
    this.actionTarget = target;
  }

  /** Someone hugged / tickled / kissed you: play your reaction (and broadcast it). */
  #react(reaction, fromUid) {
    if (!this.started) return;
    const from = this.remotes.people.get(fromUid);
    if (from && reaction !== 'tickled') {
      // Turn to face them.
      this.controller.facing = Math.atan2(from.pos.x - this.controller.position.x, from.pos.z - this.controller.position.z);
    }
    if (this.controller.seat && reaction !== 'kissed') this.#standUp();
    this.#playLocal(reaction, fromUid);
  }

  // ── Sitting on benches (and watching videos) ─────────────────────────
  #toggleSit() {
    if (this.controller.seat) return this.#standUp();
    const found = this.#freeSeat();
    if (!found) {
      this.onHint('Walk up to a bench to sit down 🪑');
      return;
    }
    const { seat, bench } = found;
    this.controller.sit({ x: seat.x, z: seat.z, facing: bench.facing > 0 ? Math.PI / 2 : -Math.PI / 2 });
    this.#playLocal('S');
    const screen = this.screens.items.find((i) => i.bench === bench);
    if (screen) {
      // Play inside this very keypress/tap, so phones allow the sound.
      this.video.play(screen);
      const s = bench.screen;
      this.rig.setShot({
        position: new THREE.Vector3(bench.x - bench.facing * 1.7, 1.75, bench.z),
        target: new THREE.Vector3(s.x, s.y - 0.1, s.z),
      });
    }
  }

  #standUp() {
    if (!this.controller?.seat) return;
    this.controller.stand();
    if (this.localEmotes.id === 'S') this.localEmotes.stop();
    this.video.stop();
    this.rig.setShot(null);
  }

  /** The nearest free bench seat within reach. */
  #freeSeat() {
    const pos = this.controller.position;
    const others = this.remotes.positions();
    let best = null;
    for (const bench of this.plan.benches) {
      for (const seat of bench.seats) {
        const d = Math.hypot(seat.x - pos.x, seat.z - pos.z);
        if (d > SIT_REACH) continue;
        if (others.some((q) => Math.hypot(q.x - seat.x, q.z - seat.z) < 0.4)) continue; // taken
        if (!best || d < best.d) best = { seat, bench, d };
      }
    }
    return best;
  }

  // ── Multiplayer hooks (used by main.js + backend/presence.js) ─────────
  /** Your avatar right now: position, facing, speed and current action. */
  localState() {
    const c = this.controller;
    const a = this.localEmotes.id;
    return { x: c.position.x, z: c.position.z, f: c.facing, s: c.speed01, a, an: this.actionNonce, at: a ? this.actionTarget : '' };
  }

  /** Everyone else, from presence.js: Map uid → { name, look, x, z, f, s, e, a, an, at }. */
  setPeople(states) {
    this.remotes.sync(states);
  }

  /** ♥ — hearts pop up above your avatar. */
  emote() {
    const p = this.controller.position;
    this.hearts.burst(p.x, 1.5, p.z, 10);
  }

  /** The closest other person, with where they are relative to you. */
  #nearestPartner() {
    const me = this.controller;
    let best = null;
    for (const o of this.remotes.list()) {
      const dx = o.pos.x - me.position.x;
      const dz = o.pos.z - me.position.z;
      const dist = Math.hypot(dx, dz);
      if (best && dist >= best.dist) continue;
      const ux = dx / (dist || 1);
      const uz = dz / (dist || 1);
      const iFace = Math.sin(me.facing) * ux + Math.cos(me.facing) * uz;
      const theyFace = -(Math.sin(o.facing) * ux + Math.cos(o.facing) * uz);
      best = { uid: o.uid, person: o, dist, facingEachOther: iFace > 0.4 && theyFace > 0.4 };
    }
    return best;
  }

  /** Context handed to the action animations (effects, who's nearby…). */
  #emoteCtx(avatar, position, facing, other) {
    return {
      avatar, fx: this.fx, hearts: this.hearts, position, facing,
      partner: other ? { position: other, angle: relativeAngle(position, facing, other) } : null,
    };
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
    if ((look.x || look.y) && !this.rig.inShot) this.rig.rotate(look.x, look.y);
    const zoom = this.input.consumeZoom();
    if (zoom) this.rig.zoom(zoom);

    // Your avatar: walking, then its action on top.
    const c = this.controller;
    c.locked = this.localEmotes.locked;
    c.speedFactor = this.localEmotes.id === 'Z' ? 0.55 : 1;
    c.update(dt, this.input.move, this.input.run, this.rig.yaw);
    const pos = c.position;
    this.#holdHands();
    const partner = this.#nearestPartner();
    const action = this.localEmotes.update(dt, this.#emoteCtx(this.avatar, pos, c.facing, partner?.person.pos), c.speed01 > 0.08);
    this.avatar.update(dt, c.speed01, action);

    // Everyone else.
    this.remotes.update(dt, (p) => this.#emoteCtx(p.avatar, p.pos, p.facing, pos));
    this.rig.update(dt, pos, this.colliders);
    this.#heartsWhenClose(dt, pos);
    this.hearts.update(dt, this.camera);
    this.fx.update(dt);

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

  /**
   * Side by side (standing, walking or sitting next to each other)? Hold
   * hands: each reaches for a point between your shoulders. Both screens work
   * this out the same way, so both see it.
   */
  #holdHands() {
    const me = this.avatar;
    if (!me.setHandTarget) return;
    me.setHandTarget(0, null);
    me.setHandTarget(1, null);
    const others = this.remotes.list();
    for (const o of others) {
      o.avatar.setHandTarget(0, null);
      o.avatar.setHandTarget(1, null);
    }
    const free = (id) => !id || id === 'S';
    let pair = null;
    if (this.started && free(this.localEmotes.id)) {
      const c = this.controller;
      for (const o of others) {
        if (!free(o.emotes.id)) continue;
        const dx = o.pos.x - c.position.x;
        const dz = o.pos.z - c.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.45 || d > 1.25) continue;
        const ux = dx / d;
        const uz = dz / d;
        const myFwd = [Math.sin(c.facing), Math.cos(c.facing)];
        const theirFwd = [Math.sin(o.facing), Math.cos(o.facing)];
        const sideBySide = Math.abs(myFwd[0] * ux + myFwd[1] * uz) < 0.55 && myFwd[0] * theirFwd[0] + myFwd[1] * theirFwd[1] > 0.3;
        if (!sideBySide || (pair && d > pair.d)) continue;
        // Which hand: the one on the other person's side. Right = (−cos f, sin f).
        const mySide = -Math.cos(c.facing) * ux + Math.sin(c.facing) * uz > 0 ? 0 : 1;
        const theirSide = -Math.cos(o.facing) * -ux + Math.sin(o.facing) * -uz > 0 ? 0 : 1;
        pair = { o, d, mySide, theirSide };
      }
    }
    if (!pair) return;
    const a = me.shoulderWorld(pair.mySide);
    const b = pair.o.avatar.shoulderWorld(pair.theirSide);
    const meet = a.lerp(b, 0.5);
    meet.y -= 0.22;
    me.setHandTarget(pair.mySide, meet.clone(), 1);
    pair.o.avatar.setHandTarget(pair.theirSide, meet.clone(), 1);
  }

  /** Standing close to someone? Little hearts float up between you. */
  #heartsWhenClose(dt, pos) {
    this.closeTimer -= dt;
    if (this.closeTimer > 0) return;
    for (const other of this.remotes.positions()) {
      if (Math.hypot(other.x - pos.x, other.z - pos.z) < CLOSE_TOGETHER) {
        this.hearts.burst((other.x + pos.x) / 2, 1.3, (other.z + pos.z) / 2, 1, 0.2);
        this.closeTimer = 0.45;
        return;
      }
    }
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
    if (!this.started || !best?.photo.url) best = null; // the preview's blank frames have nothing to show
    if (best !== this.focus) {
      this.focus = best;
      this.onFocusChange(best);
    }
  }

  /** Tap / click: open the photo under the pointer (if no wall is in the way). */
  #handleTap(clientX, clientY) {
    if (this.video.mutedFallback) return this.video.unmute(); // first tap after a silent video start: sound on
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.frames.items.map((i) => i.mesh), false)[0];
    if (!hit || hit.distance > 14) return;
    const wall = raycastBoxes(this.raycaster.ray.origin, this.raycaster.ray.direction, hit.distance, this.colliders);
    if (wall < hit.distance - 0.05) return;
    const item = this.frames.items[hit.object.userData.frameIndex];
    if (item.photo.url) this.onOpenPhoto(item);
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

/** Angle from `facing` to the direction of `to` (0 = straight ahead), −π…π. */
function relativeAngle(from, facing, to) {
  const a = Math.atan2(to.x - from.x, to.z - from.z) - facing;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Free the GPU memory of everything under `root`. */
function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) {
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
      m.dispose();
    }
  });
}
