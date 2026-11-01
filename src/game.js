/**
 * The game: owns the renderer, scene, avatars, camera and the main loop.
 * It knows nothing about HTML or the database — it reports what happens
 * through callbacks (onRoomChange, onFocusChange, onFinaleNear, onOpenPhoto,
 * onHint, onVideoChange, onVideoFullscreen, onSeatChange, onProposal…) and
 * main.js connects those to the screen and Firebase.
 *
 *   const game = new Game(canvas, joystick, CONFIG);
 *   await game.setMuseum(config, photos, look, onProgress, videos, extras);  // build (or rebuild)
 *   game.run();                                                              // start drawing
 *   game.start();                                                            // after "Enter"
 *   game.performAction('W');                                                 // A–Z actions
 */
import * as THREE from 'three';
import { planMuseum } from './world/layout.js';
import { buildMuseum } from './world/museum.js';
import { buildFrames } from './world/frames.js';
import { buildFinale } from './world/finale.js';
import { buildDust } from './world/dust.js';
import { buildScreens, VideoPlayer } from './world/videos.js';
import { buildKeys } from './world/keys.js';
import { buildClocks } from './world/clocks.js';
import { buildDecorations } from './world/decorations.js';
import { buildMapTable } from './world/mapTable.js';
import { buildMirror } from './world/mirror.js';
import { placeOf } from './map/worldMap.js';
import { resolveDecoration } from './seasons.js';
import { HeartBursts } from './world/heartBursts.js';
import { Effects } from './world/effects.js';
import { raycastBoxes } from './world/collision.js';
import { createAvatar } from './player/avatar.js';
import { PlayerController } from './player/controller.js';
import { CameraRig } from './player/cameraRig.js';
import { RemoteAvatars } from './player/remoteAvatars.js';
import { EmotePlayer, EMOTES, BENCH_MENU } from './player/emotes.js';
import { Tour } from './player/tour.js';
import { Input } from './input/input.js';
import { AdaptiveResolution } from './adaptiveResolution.js';

const CLOSE_TOGETHER = 1.6; // metres — closer than this, hearts float up between you
const CLOSE_FOR_HUG = 1.6; // hug / kiss / tickle / twirl reach
const CLOSE_TO_PROPOSE = 2.6;
const SIT_REACH = 1.9; // how close to a bench seat you must be to sit down
const TOGETHER = 0.9; // seconds: both pressed D within this → dance together
const COSY = 0.45; // sitting close: each seat moves this share of the way to the bench's middle

export class Game {
  constructor(canvas, joystickEl, config) {
    this.config = config;
    this.canvas = canvas;

    // Callbacks for the UI (set by main.js).
    this.onRoomChange = () => {};
    this.onFocusChange = () => {};
    this.onFinaleNear = () => {};
    this.onOpenPhoto = () => {};
    this.onOpenPlace = () => {}; // (photos) — a pin on the map table
    this.onHint = () => {}; // (text) — short messages like "Walk up to a bench"
    this.onVideoChange = () => {}; // (playing, { muted }) — e.g. pause the music
    this.onVideoFullscreen = () => {}; // Space or a tap on the screen while a film plays
    this.onSeatChange = () => {}; // (seated) — the action menu changes
    this.onFindKey = () => {}; // (keyId) — tapped a hidden key
    this.onProposal = () => {}; // (fromName) — someone kneels in front of you
    this.onProposalEnd = () => {}; // they got up without an answer
    this.onProposalAnswered = () => {}; // (name) — they said yes!
    this.onSelfie = () => {}; // (blob) — a bench selfie
    this.onFlash = () => {}; // the camera flash
    this.onQuiet = () => {}; // (quiet) — a quiet moment starts / ends
    this.onTour = () => {}; // (state) — the guided tour

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
    // Space / Enter: the film full screen while one plays, otherwise the photo you're at.
    this.input.onInteract = () => (this.video.playing ? this.onVideoFullscreen() : this.focus && this.onOpenPhoto(this.focus));
    this.input.onAction = (key) => this.performAction(key);
    this.remotes = new RemoteAvatars(this.scene);
    this.hearts = new HeartBursts(this.scene);
    this.fx = new Effects(this.scene);
    this.remotes.onEmote = (x, y, z) => this.hearts.burst(x, y, z, 10);
    this.remotes.onTargeted = (reaction, fromUid) => this.#react(reaction, fromUid);
    this.localEmotes = new EmotePlayer();
    // A bench action ends back in sitting; tell the others about it.
    this.localEmotes.next = (def) => (this.controller?.seat && def.seated && def.id !== 'S' ? 'S' : null);
    this.localEmotes.onChain = () => {
      this.actionNonce++;
      this.actionTarget = '';
    };
    this.actionNonce = 0; // changes on every new action, so the other screen knows to play it
    this.actionTarget = '';
    this.video = new VideoPlayer();
    this.video.onChange = (playing, info) => this.onVideoChange(playing, info);
    this.raycaster = new THREE.Raycaster();

    this.world = null; // everything belonging to the current museum
    this.started = false;
    this.paused = false; // true while a photo is open full-screen
    this.holdFrames = false; // true while loading: don't draw, give slow phones all their power
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.timeScale = 1; // < 1 during a quiet moment
    this.quiet = false;
    this.closeTimer = 0;
    this.selfie = null;
    this.captureNext = false;
    this.proposalFrom = null;
    this.fps = { frames: 0, time: 0, value: 60 };

    this.#resize();
    addEventListener('resize', () => this.#resize());
    window.visualViewport?.addEventListener('resize', () => this.#resize());
  }

  /** Calmer: no swooping camera, fewer floating things (before setMuseum, so it applies to the build too). */
  setReducedMotion(on) {
    this.reducedMotion = Boolean(on) || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.remotes.reducedMotion = this.reducedMotion;
  }

  /**
   * Build (or rebuild) the museum.
   * @param config  settings for this museum (museumConfig.js)
   * @param photos  [{ width, height, color, room, title, date, caption, url?(size), lat, lng, place }]
   * @param look    the visitor's avatar look (looks.js)
   * @param onPhotoProgress (loaded, total) while photos download
   * @param videos  [{ room, bench, width, height, title, posterUrl, url() }]
   * @param extras { mirror: this visitor's mirror pictures [{ url(size), width, height }] }
   */
  async setMuseum(config, photos, look, onPhotoProgress = () => {}, videos = [], extras = {}) {
    this.config = config;
    this.#standUp();
    this.tour?.stop();
    this.tour = null;
    if (this.world) {
      this.mirror?.dispose();
      this.scene.remove(this.world);
      disposeObject(this.world);
    }
    this.remotes.clear();
    this.remotes.ring = config.proposal;
    this.world = new THREE.Group();

    this.plan = planMuseum(config, photos, videos);
    const museum = buildMuseum(this.plan, config, this.renderer);
    this.colliders = museum.colliders;
    this.world.add(museum.group);

    this.screens = buildScreens(this.plan);
    this.world.add(this.screens.group);
    // Videos download after the photos (so the walls fill up first), a room ahead of you.
    this.photosLoaded = false;
    this.frames = buildFrames(this.plan, config, this.renderer, (loaded, total) => {
      onPhotoProgress(loaded, total);
      if (loaded >= total && !this.photosLoaded) {
        this.photosLoaded = true;
        this.screens.preload(Math.max(0, this.roomIndex));
      }
    });
    this.world.add(this.frames.group);

    // The key hunt's keys in the photos.
    this.keys = buildKeys(this.frames, config.hunt);
    this.world.add(this.keys.group);

    // The memory map (pins where the photos were taken) and the hidden room around it.
    const finaleRoom = this.plan.rooms.find((r) => r.isFinale);
    const pinned = photos.filter((p) => placeOf(p) && p.url);
    const withTable = Boolean(finaleRoom && config.memoryMap.enabled && pinned.length);
    this.finale = config.finale.enabled ? buildFinale(this.plan, config.finale, this.colliders, { withTable }) : null;
    if (this.finale) this.world.add(this.finale.group);
    this.mapTable = withTable ? buildMapTable(finaleRoom, pinned, config.memoryMap.title, this.colliders) : null;
    if (this.mapTable) this.world.add(this.mapTable.group);

    // The mirror, with this visitor's own pictures.
    this.mirror = buildMirror(this.plan, extras.mirror ?? [], { reducedMotion: this.reducedMotion, renderer: this.renderer });
    if (this.mirror) this.world.add(this.mirror.group);

    // Seasonal decorations.
    this.decorations = buildDecorations(this.plan, resolveDecoration(config.decoration), this.colliders, { reducedMotion: this.reducedMotion });
    this.world.add(this.decorations.group);
    this.clocks = null;

    this.dust = buildDust(this.plan);
    this.dust.object.visible = !this.reducedMotion;
    this.world.add(this.dust.object);
    this.scene.add(this.world);

    const avatar = await createAvatar(config, look);
    avatar.ring = config.proposal;
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

  /** Clocks in the first room: [{ tz, names }] (clocks.js → clockZones). */
  setClocks(zones) {
    if (!this.world) return;
    if (this.clocks) {
      this.world.remove(this.clocks.group);
      disposeObject(this.clocks.group);
    }
    this.clocks = buildClocks(this.plan, zones, this.plan.rooms[0]?.trim);
    this.world.add(this.clocks.group);
  }

  /** The key hunt: which keys have been found (Set of ids), and whether the curtain stays closed. */
  setHunt(found, { locked = false, lockText = '' } = {}) {
    this.keys?.setFound(found);
    if (this.finale && (this.finale.locked !== locked || locked)) this.finale.setLocked(locked, lockText);
  }

  /** Change your avatar's look (keeps its position). */
  async setLook(look) {
    const avatar = await createAvatar(this.config, look);
    avatar.ring = this.config.proposal;
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
      const real = Math.min(timer.getDelta(), 1 / 10); // keeps normal speed down to 10 fps
      if (this.world && !this.holdFrames) this.#tick(real);
    });
  }

  /** Called when the player presses "Enter". */
  start() {
    this.started = true;
    this.input.setEnabled(true);
    this.intro = this.reducedMotion ? 1 : 0;
    this.introFrom = { pitch: this.rig.pitch, distance: this.rig.distance, yaw: this.rig.yaw };
    if (this.reducedMotion) {
      const c = this.config.camera;
      Object.assign(this.rig, { pitch: c.pitch, distance: c.distance, yaw: 0 });
    }
  }

  /** Freeze walking while a full-screen view is open. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) this.input.reset();
    this.input.setEnabled(this.started && !paused);
  }

  /** Frames per second lately, and whether the resolution can't go any lower (for the 2D gallery fallback). */
  get performanceInfo() {
    return { fps: this.fps.value, lowest: this.resolution.ratio <= 1 };
  }

  // ── The guided tour ───────────────────────────────────────────────────
  startTour() {
    this.tour ??= new Tour(this.plan, { hasTable: Boolean(this.mapTable) });
    this.tour.onChange = (state) => this.onTour(state);
    this.#standUp();
    this.tour.start();
  }

  /** ⏸ / ▶ */
  toggleTour() {
    if (!this.tour) return this.startTour();
    if (this.tour.state === 'paused') this.tour.resume();
    else if (this.tour.state === 'done' || this.tour.state === 'off') this.tour.start();
    else this.tour.pause();
  }

  stopTour() {
    this.tour?.stop();
  }

  nextTourStop() {
    this.tour?.next();
  }

  // ── Actions (A–Z) ─────────────────────────────────────────────────────
  /**
   * Play an action by its letter. Hug, Kiss and Tickle reach the other person
   * when they're close (Hug and Kiss: facing each other); otherwise you do a
   * heart with your hands, blow a kiss, or tickle the air. D next to them
   * spins them round (or, if you both press it, you dance together). S sits on
   * (or gets up from) a nearby bench — and sitting, every letter does
   * something else (BENCH_MENU).
   */
  performAction(key) {
    key = String(key).toUpperCase();
    if (!this.started || this.paused || !EMOTES[key]) return;
    if (this.controller.seat) return this.#benchAction(key);
    if (key === 'D' && this.#danceTogether()) return;
    if (this.localEmotes.locked) return; // let the current one finish (flips, falls…)
    if (key === 'S') return this.#toggleSit();

    const partner = this.#nearestPartner();
    const close = partner && partner.dist < CLOSE_FOR_HUG;
    let id = key;
    let target = '';
    if (key === 'H') close && partner.facingEachOther ? (target = partner.uid) : (id = 'heart');
    else if (key === 'K') close && partner.facingEachOther ? (target = partner.uid) : (id = 'blowkiss');
    else if (key === 'T') close ? (target = partner.uid) : (id = 'tickleair');
    this.#playLocal(id, target);
  }

  /** D next to someone: twirl them — or, if you both pressed it, dance together. */
  #danceTogether() {
    const partner = this.#nearestPartner();
    if (!partner || partner.dist > CLOSE_FOR_HUG) return false;
    const mine = this.localEmotes;
    if (mine.id === 'duet' || mine.id === 'duet2') {
      mine.stop(); // D again: stop dancing
      return true;
    }
    // They pressed it a moment ago and you're spinning: you pressed it too → dance.
    if (mine.id === 'spun' && mine.time < TOGETHER && mine.target === partner.uid) {
      this.#playLocal('duet', partner.uid);
      return true;
    }
    if (mine.locked) return true;
    this.#playLocal('twirl', partner.uid);
    return true;
  }

  /** A letter while sitting on a bench. */
  #benchAction(key) {
    if (key === 'S') return this.#standUp();
    const id = BENCH_MENU[key];
    const def = EMOTES[id];
    if (!def || this.localEmotes.locked) return;
    if (def.loop && this.localEmotes.id === id) return this.#playLocal('S'); // Z again: sit up
    const partner = this.#seatedPartner();
    let play = id;
    let target = '';
    if (def.pair && partner) target = partner.uid;
    if (id === 'bBigHug' && !partner) play = 'bHugFail'; // nobody to hug…
    if (def.scoot && partner) this.#scoot();
    this.#playLocal(play, target);
  }

  /** The 💍 button (for the one who proposes): kneel in front of them — or get up again. */
  propose() {
    if (!this.started || this.paused) return;
    if (this.localEmotes.id === 'propose') return this.localEmotes.stop();
    const partner = this.#nearestPartner();
    if (!partner) return this.onHint('Wait until they’re here with you 💍');
    if (partner.dist > CLOSE_TO_PROPOSE) return this.onHint(`Walk up to ${partner.person.name} first 💍`);
    this.#standUp();
    this.#playLocal('propose', partner.uid);
    this.onHint('Down on one knee… 💍 (walk to get up)');
  }

  /** The answer: YES (it's the only button that can be pressed). */
  answerYes() {
    const from = this.proposalFrom;
    this.proposalFrom = null;
    if (from) this.#playLocal('yes', from);
  }

  #playLocal(id, target = '') {
    if (!this.localEmotes.play(id, { target })) return;
    this.actionNonce++;
    this.actionTarget = target;
  }

  /** Someone aimed an action at you: play your reaction (and broadcast it). */
  #react(reaction, fromUid) {
    if (!this.started) return;
    const def = EMOTES[reaction];
    const from = this.remotes.people.get(fromUid);
    const mine = this.localEmotes;
    // You both pressed D at the same moment: dance together.
    if (reaction === 'spun' && mine.id === 'twirl' && mine.target === fromUid && mine.time < TOGETHER) return this.#playLocal('duet', fromUid);
    if (reaction === 'duet2' && (mine.id === 'duet' || mine.id === 'duet2')) return; // already dancing
    if (def.seated) {
      if (!this.controller.seat) return; // a bench action, but you're not on the bench
      if (def.scoot) this.#scoot();
    } else {
      if (from && reaction !== 'tickled') {
        // Turn to face them.
        this.controller.facing = Math.atan2(from.pos.x - this.controller.position.x, from.pos.z - this.controller.position.z);
      }
      if (this.controller.seat && reaction !== 'kissed') this.#standUp();
    }
    this.#playLocal(reaction, fromUid);
    if (reaction === 'proposed') {
      this.proposalFrom = fromUid;
      this.onProposal(from?.name ?? '');
    } else if (reaction === 'yay') {
      this.onProposalAnswered(from?.name ?? '');
    }
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
    this.controller.sit({ x: seat.x, z: seat.z, facing: bench.facing > 0 ? Math.PI / 2 : -Math.PI / 2, bench });
    this.#playLocal('S');
    this.onSeatChange(true);
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
    if (this.localEmotes.current?.def.seated) this.localEmotes.stop();
    this.video.stop();
    this.rig.setShot(null);
    this.selfie = null;
    this.onSeatChange(false);
  }

  /** Slide closer to the middle of the bench (both of you do, for cuddly actions). */
  #scoot() {
    const seat = this.controller.seat;
    if (!seat || seat.cosy || !seat.bench) return;
    seat.x += (seat.bench.x - seat.x) * COSY;
    seat.z += (seat.bench.z - seat.z) * COSY;
    seat.cosy = true;
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

  /** The other person sitting right beside you on the bench, if any. */
  #seatedPartner() {
    const p = this.#nearestPartner();
    return p && p.dist < 1.5 && p.person.emotes.current?.def.seated ? p : null;
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
      avatar, fx: this.fx, hearts: this.hearts, position, facing, reducedMotion: this.reducedMotion,
      partner: other ? { position: other, angle: relativeAngle(position, facing, other) } : null,
    };
  }

  #tick(real) {
    // A quiet moment slows everything down.
    this.timeScale += ((this.quiet ? 0.35 : 1) - this.timeScale) * Math.min(1, real * 2);
    const dt = real * this.timeScale;
    this.time += dt;
    this.input.update();

    if (!this.started) {
      // Before "Enter": slowly sway the camera around the avatar.
      if (!this.reducedMotion) this.rig.yaw = Math.sin(this.time * 0.18) * 0.7;
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

    // The guided tour walks for you — until you walk yourself.
    let move = this.input.move;
    let run = this.input.run;
    if (this.tour?.active) {
      if (Math.hypot(move.x, move.y) > 0.2) this.tour.pause();
      else {
        move = this.tour.update(dt, this.controller, this.rig.yaw, () => Boolean(this.finale?.locked));
        run = false;
        // Keep the camera behind the avatar.
        const behind = this.controller.facing + Math.PI;
        if (!look.x) this.rig.yaw += Math.atan2(Math.sin(behind - this.rig.yaw), Math.cos(behind - this.rig.yaw)) * Math.min(1, dt * 1.5);
      }
    }

    // Your avatar: walking, then its action on top.
    const c = this.controller;
    c.locked = this.localEmotes.locked;
    c.speedFactor = this.localEmotes.id === 'Z' ? 0.55 : 1;
    c.update(dt, move, run, this.rig.yaw);
    const pos = c.position;
    this.#holdHands();
    const partner = this.#nearestPartner();
    this.#followPartner(partner);
    const action = this.localEmotes.update(dt, this.#emoteCtx(this.avatar, pos, c.facing, partner?.person.pos), c.speed01 > 0.08);
    this.avatar.update(dt, c.speed01, action);

    // Everyone else.
    this.remotes.update(dt, (p) => this.#emoteCtx(p.avatar, p.pos, p.facing, pos));
    this.#quietMoment(partner);
    this.#selfieShot(partner);
    this.rig.update(dt, pos, this.colliders);
    this.#heartsWhenClose(dt, pos);
    this.hearts.update(dt, this.camera);
    this.fx.update(dt);

    this.#updateRoom(pos);
    this.#updateFocus(pos);
    this.frames.update(dt, this.focus);
    this.keys.update(dt);
    this.decorations.update(dt);
    this.clocks?.update(dt);
    this.mapTable?.update(dt);
    this.mirror?.update(dt, this.started ? pos : new THREE.Vector3(1e6, 0, 1e6));
    this.dust.update(dt, this.renderer.getPixelRatio());
    if (this.finale) {
      const near = this.finale.update(dt, pos) && this.started;
      if (near !== this.finaleNear) {
        this.finaleNear = near;
        this.onFinaleNear(near);
      }
    }

    if (this.resolution.update(real)) this.#resize();
    this.#measureFps(real);
    if (!this.paused) {
      this.renderer.render(this.scene, this.camera);
      if (this.captureNext) {
        // Right after drawing, while the picture is still there.
        this.captureNext = false;
        this.canvas.toBlob((blob) => blob && this.onSelfie(blob), 'image/jpeg', 0.92);
      }
    }
  }

  /**
   * A reaction that lasts as long as the other person keeps doing the action
   * (dancing together, lying in your lap, kneeling with a ring) ends when they stop.
   */
  #followPartner(partner) {
    const cur = this.localEmotes.current;
    if (!cur?.def.follows || cur.stopping || cur.t < 1.2) return;
    const other = this.remotes.people.get(cur.target);
    if (other && cur.def.follows.includes(other.emotes.id)) return;
    if (cur.def.id === 'proposed') {
      this.proposalFrom = null;
      this.onProposalEnd();
    }
    if (this.controller.seat) this.#playLocal('S');
    else this.localEmotes.stop();
  }

  /** Q on a bench: everything slows down and the music softens while either of you has it on. */
  #quietMoment() {
    const quiet = Boolean(this.localEmotes.current?.def.quiet && !this.localEmotes.current.stopping)
      || this.remotes.list().some((o) => o.emotes.current?.def.quiet && !o.emotes.current.stopping && o.pos.distanceTo(this.controller.position) < 2.5);
    if (quiet !== this.quiet) {
      this.quiet = quiet;
      this.onQuiet(quiet);
    }
  }

  /** P on a bench: the camera swings round in front of you, a flash, and a real picture of the two of you. */
  #selfieShot(partner) {
    const cur = this.localEmotes.current;
    const seat = this.controller.seat;
    if (!cur?.def.selfie || cur.stopping || !seat) {
      if (this.selfie) {
        this.rig.setShot(this.selfie.before);
        this.selfie = null;
      }
      return;
    }
    const t = cur.t;
    if (!this.selfie) this.selfie = { phase: 0, before: this.rig.inShot ? this.rig.shot : null };
    const s = this.selfie;
    if (s.phase === 0 && t > 0.8) {
      s.phase = 1;
      const me = this.controller.position;
      const mid = partner && partner.dist < 1.5 ? me.clone().lerp(partner.person.pos, 0.5) : me.clone();
      const forward = new THREE.Vector3(Math.sin(seat.facing), 0, Math.cos(seat.facing));
      this.rig.setShot({ position: mid.clone().addScaledVector(forward, 1.7).setY(1.2), target: mid.clone().setY(0.95) });
    } else if (s.phase === 1 && t > 1.9) {
      s.phase = 2;
      this.onFlash();
      this.captureNext = true;
    } else if (s.phase === 2 && t > 2.5) {
      s.phase = 3;
      this.rig.setShot(s.before);
    }
  }

  #measureFps(real) {
    const f = this.fps;
    f.frames++;
    f.time += real;
    if (f.time >= 2) {
      f.value = f.frames / f.time;
      f.frames = 0;
      f.time = 0;
    }
  }

  /**
   * Side by side (standing, walking or sitting next to each other)? Hold
   * hands: each reaches for a point between your shoulders. Dancing together,
   * you hold both hands. Both screens work this out the same way, so both see it.
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
    if (!this.started) return;
    const dancing = (id) => id === 'duet' || id === 'duet2';
    if (dancing(this.localEmotes.id)) {
      const o = others.find((p) => dancing(p.emotes.id) && p.pos.distanceTo(this.controller.position) < 1.8);
      if (o) {
        // Facing each other: my right hand meets their left, my left their right.
        for (const [mine, theirs] of [[0, 1], [1, 0]]) {
          const meet = me.shoulderWorld(mine).lerp(o.avatar.shoulderWorld(theirs), 0.5);
          meet.y -= 0.1;
          me.setHandTarget(mine, meet.clone(), 1);
          o.avatar.setHandTarget(theirs, meet.clone(), 1);
        }
        return;
      }
    }
    const free = (id) => !id || id === 'S';
    let pair = null;
    if (free(this.localEmotes.id)) {
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
        this.closeTimer = this.reducedMotion ? 1.6 : 0.45;
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
      if (this.photosLoaded) this.screens.preload(index);
      if (this.mapTable && this.plan.rooms[index].isFinale) {
        setTimeout(() => this.plan.rooms[this.roomIndex]?.isFinale && this.onHint('Tap a pin on the map to see the photos from there 📍'), 3500);
      }
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

  /** Tap / click: the playing film full screen, a hidden key, a pin on the map, or the photo under the pointer (if no wall is in the way). */
  #handleTap(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.video.playing && this.raycaster.intersectObject(this.video.item.mesh, false).length) return this.onVideoFullscreen();
    if (this.video.mutedFallback) return this.video.unmute(); // first tap after a silent video start: sound on
    const visible = (hit) => hit && hit.distance < 14 && raycastBoxes(this.raycaster.ray.origin, this.raycaster.ray.direction, hit.distance, this.colliders) >= hit.distance - 0.05;
    const key = this.keys.hit(this.raycaster);
    if (visible(key)) return this.onFindKey(key.key.id);
    const pin = this.mapTable?.hit(this.raycaster);
    if (pin && pin.distance < 8) return this.onOpenPlace(pin.photos);
    const hit = this.raycaster.intersectObjects(this.frames.items.map((i) => i.mesh), false)[0];
    if (!visible(hit)) return;
    const item = this.frames.items[hit.object.userData.frameIndex];
    if (item.photo.url) this.onOpenPhoto(item);
  }

  /** Photos in the same room as `item`, in walking order (for prev/next in the viewer). */
  photosInRoomOf(item) {
    return this.frames.items.filter((i) => i.roomIndex === item.roomIndex);
  }

  /** The wall item showing a photo (for the map's pins). */
  itemOfPhoto(photo) {
    return this.frames.items.find((i) => i.photo === photo || i.photo.id === photo.id) ?? { photo };
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
