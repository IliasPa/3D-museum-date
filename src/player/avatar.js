/**
 * The avatar.
 *
 * Every avatar — the built-in one below or a .glb model (gltfAvatar.js) —
 * has the same small interface, so the rest of the game doesn't care which
 * one it gets:
 *
 *   avatar.root                         THREE.Object3D placed & turned by the controller
 *   avatar.update(dt, speed01, action)  animate; speed01 = 0 standing … 1 running,
 *                                       action = the emote being played (emotes.js) or null
 *   avatar.setHandTarget(side, point, weight)  reach a hand towards a point (holding hands)
 *
 * createAvatar() picks one based on config.avatar.type.
 */
import * as THREE from 'three';
import { radialGlowTexture } from '../world/textures.js';
import { heartShape } from '../world/finale.js';
import { defaultLook } from './looks.js';
import * as parts from './avatarParts.js';
import { Pet } from './pet.js';

/** `look` = the visitor's chosen body, hair, outfit and extras (see looks.js). */
export async function createAvatar(config, look = defaultLook()) {
  if (config.avatar.type === 'glb') {
    try {
      const { GltfAvatar } = await import('./gltfAvatar.js'); // only downloaded if used
      return await GltfAvatar.load(config.avatar.glb);
    } catch (err) {
      console.error('[avatar] could not load the .glb avatar, using the built-in one instead:', err);
    }
  }
  return new ProceduralAvatar(look);
}

/** Soft dark circle under the avatar — much cheaper than real shadows. */
export function blobShadow(radius = 0.42) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: radialGlowTexture(0, [[0, 0.55], [0.6, 0.25], [1, 0]]),
      color: '#000000',
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  shadow.renderOrder = 1;
  return shadow;
}

// ── Proportions (metres, "body space": feet at y = 0, facing +z) ───────
export const BODY = {
  shoulderY: 0.735,
  shoulderX: { guy: 0.225, girl: 0.205 },
  upperArm: 0.19, // shoulder → elbow
  forearm: 0.18, // elbow → wrist
  palm: 0.035, // wrist → palm centre (hand targets are palm centres)
  hipY: 0.36,
  hipX: 0.095,
  thigh: 0.18,
  shin: 0.155,
};
const FINGERS = ['t', 'i', 'm', 'r', 'p']; // thumb, index, middle, ring, pinky

/**
 * Every animatable value of the procedural avatar. Walking/idle fills these
 * in, an action (emotes.js) can override any of them, then they're applied.
 *
 *   hand{R,L}{X,Y,Z}   where each palm should be (body space; arms bend to reach)
 *   palm{R,L}{X,Y,Z}   which way each palm faces
 *   tip{R,L}{X,Y,Z,W}  (optional) which way the fingers point — the wrist bends that way (W = how much)
 *   {R,L}_{t,i,m,r,p}  finger curl 0 (straight) … 1 (fist); {R,L}_v = ✌️ spread; {R,L}_o = thumb turned down (0…1)
 *   leg{R,L}F, knee{R,L}  hip swing forward, knee bend
 *   rig…               the whole body (lying down, flips, jumps) around rigPivot
 *   brow{Y,Tilt}       eyebrows up / (+) cross … (−) sad
 */
export function restPose() {
  const p = {
    rigY: 0, rigZ: 0, rigRX: 0, rigRY: 0, rigRZ: 0, rigPivot: 0,
    bodyY: 0, bodyRX: 0, bodyRY: 0, bodyRZ: 0,
    headRX: 0, headRY: 0, headRZ: 0,
    handRX: -0.28, handRY: 0.36, handRZ: 0.02, handLX: 0.28, handLY: 0.36, handLZ: 0.02,
    palmRX: 1, palmRY: 0, palmRZ: 0, palmLX: -1, palmLY: 0, palmLZ: 0,
    tipRX: 0, tipRY: -1, tipRZ: 0, tipRW: 0, tipLX: 0, tipLY: -1, tipLZ: 0, tipLW: 0,
    legRF: 0, legLF: 0, kneeR: 0.05, kneeL: 0.05,
    eyesOpen: 1, eyeScale: 1, wink: 0, mouthOpen: 0, pucker: 0, blush: 0, browY: 0, browTilt: 0,
  };
  for (const s of ['R', 'L']) {
    for (const f of FINGERS) p[`${s}_${f}`] = f === 't' ? 0.2 : 0.3;
    p[`${s}_v`] = 0;
    p[`${s}_o`] = 0;
  }
  return p;
}
const POSE_KEYS = Object.keys(restPose());
const WRIST_BEND = 1.3; // how far (radians) a wrist bends from the forearm's line
const DOWN = new THREE.Vector3(0, -1, 0);
const { mat, capsule, sphere } = parts;

/**
 * A chibi character built from simple, smooth shapes: jointed arms and legs,
 * hands with fingers, an expressive face — plus whatever the visitor picked
 * in the avatar studio (avatarParts.js builds the clothes, hair and extras).
 * Faces +Z. About 1.3 m tall.
 */
export class ProceduralAvatar {
  constructor(look) {
    this.look = look = { ...defaultLook(), ...look };
    const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
    this.mats = {
      skin: mat(look.skin),
      skinDark: mat(shade(look.skin, 0.9)),
      hair: mat(look.hair),
      top: mat(look.topColor),
      topDark: mat(shade(look.topColor, 0.82)),
      accent: mat(look.accent),
      bottom: mat(look.bottomColor),
      bottomDark: mat(shade(look.bottomColor, 0.8)),
      shoes: mat(look.shoes),
      hat: mat(look.hatColor),
      extra: mat(look.extraColor),
      sole: mat('#f2eee8'),
      dark: new THREE.MeshBasicMaterial({ color: '#2a1f1d' }),
      white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      cloth: mat('#f7f4ef'),
      iris: new THREE.MeshBasicMaterial({ color: look.eyes }),
      mouth: new THREE.MeshBasicMaterial({ color: '#7a2a32' }),
      gold: new THREE.MeshPhongMaterial({ color: '#e0b84c', shininess: 90, specular: '#fff3c0' }),
    };
    const isGirl = look.body === 'girl';
    this.build = { slim: 0.88, regular: 1, cuddly: 1.15, strong: 1.08 }[look.build] ?? 1; // body width
    this.strong = look.build === 'strong';
    this.shoulderX = BODY.shoulderX[isGirl ? 'girl' : 'guy'] * (1 + (this.build - 1) * 0.6) * (this.strong ? 1.1 : 1);
    this.depth = 1 + (this.build - 1) * 0.6; // body depth
    this.front = 0.16 * this.depth; // the chest's surface (for prints, buttons, ties)

    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.root.add(blobShadow());
    // rig → rigInner lets whole-body moves rotate around a chosen pivot height.
    this.rig = new THREE.Group();
    this.rigInner = new THREE.Group();
    this.rig.add(this.rigInner);
    this.root.add(this.rig);
    this.body = new THREE.Group();
    this.body.scale.setScalar(look.height ?? 1);
    this.rigInner.add(this.body);

    // ── Legs: hip → thigh → knee → shin → shoe ──
    const outfit = parts.outfitInfo(look);
    this.legs = [];
    this.knees = [];
    this.feet = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * BODY.hipX, BODY.hipY, 0);
      const thigh = new THREE.Mesh(capsule(0.072, 0.1), outfit.thighs === 'skin' ? this.mats.skin : this.mats.bottom);
      thigh.position.y = -0.085;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -BODY.thigh;
      const shin = new THREE.Mesh(capsule(0.064, 0.09), outfit.shins === 'skin' ? this.mats.skin : this.mats.bottom);
      shin.position.y = -0.07;
      knee.add(shin);
      // The ankle keeps the shoe level with the body (soles flat on the floor).
      const foot = new THREE.Group();
      foot.position.y = -BODY.shin;
      knee.add(foot);
      hip.add(knee);
      parts.buildLegwear(this, s, hip, knee);
      parts.buildShoe(this, s, foot, knee);
      this.body.add(hip);
      this.legs.push(hip);
      this.knees.push(knee);
      this.feet.push(foot);
    }

    // ── Torso and clothes ──
    this.torso = new THREE.Mesh(capsule(0.19, 0.2, 6, 20), parts.topMaterial(this));
    this.torso.position.y = 0.565;
    this.torso.scale.set((isGirl ? 0.93 : 1.04) * this.build * (look.top === 'puffer' ? 1.08 : 1), 1, 0.84 * this.depth * (look.top === 'puffer' ? 1.1 : 1));
    this.body.add(this.torso);
    parts.buildTop(this);
    parts.buildBottom(this);
    parts.buildNeckwear(this);
    parts.buildBack(this);
    parts.buildTail(this);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 14), this.mats.skin);
    neck.position.y = 0.8;
    this.body.add(neck);

    // ── Arms: shoulder → upper arm → elbow → forearm → hand with fingers ──
    this.arms = [];
    this.elbows = [];
    this.hands = [];
    this.fingers = [];
    const thick = (this.strong ? 1.18 : 1) * (look.top === 'puffer' ? 1.22 : 1);
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * this.shoulderX, BODY.shoulderY, 0);
      const sleeves = outfit.sleeves; // 'long' | 'short' | 'none'
      const upper = new THREE.Mesh(capsule(0.058 * thick, 0.13), sleeves === 'none' ? this.mats.skin : this.mats.top);
      upper.position.y = -0.09;
      shoulder.add(upper);
      if (sleeves === 'short') {
        // Short sleeves: the lower half of the upper arm is bare.
        upper.scale.y = 0.55;
        upper.position.y = -0.05;
        const bare = new THREE.Mesh(capsule(0.05 * (this.strong ? 1.15 : 1), 0.09), this.mats.skin);
        bare.position.y = -0.11;
        shoulder.add(bare);
      }
      const elbow = new THREE.Group();
      elbow.position.y = -BODY.upperArm;
      const fore = new THREE.Mesh(capsule(0.05 * (thick > 1 ? thick * 0.95 : 1), 0.12), sleeves === 'long' ? this.mats.top : this.mats.skin);
      fore.position.y = -0.085;
      elbow.add(fore);
      if (sleeves === 'long') {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * thick, 0.055 * thick, 0.03, 14), outfit.cuff === 'accent' ? this.mats.accent : this.mats.topDark);
        cuff.position.y = -0.16;
        elbow.add(cuff);
      }
      if (outfit.armStripes) parts.sleeveStripes(this, upper);
      const hand = this.#buildHand(s, this.mats.skin);
      hand.position.y = -BODY.forearm;
      elbow.add(hand);
      shoulder.add(elbow);
      this.body.add(shoulder);
      this.arms.push(shoulder);
      this.elbows.push(elbow);
      this.hands.push(hand);
    }

    // ── Head ──
    const headSize = look.headSize ?? 1;
    this.head = new THREE.Group();
    this.head.position.y = 1.0 + (headSize - 1) * 0.24; // a bigger head still sits on the neck
    this.head.scale.setScalar(headSize);
    this.body.add(this.head);
    const skull = new THREE.Mesh(sphere(0.3, 36, 26), this.mats.skin);
    skull.scale.set(1, 0.97, 0.98);
    this.head.add(skull);
    parts.buildEars(this);
    parts.buildNose(this);
    parts.buildHair(this);
    parts.buildFace(this);
    parts.buildHat(this);
    parts.buildGlasses(this);
    parts.buildEarwear(this);
    parts.buildHeld(this);
    if (look.pet !== 'none') {
      this.pet = new Pet(look.pet, look.petColor);
      this.root.add(this.pet.object);
    }

    // Name tags float just above the highest point (tall hats, big heads).
    this.root.updateMatrixWorld(true);
    this.topY = Math.max(1.5, new THREE.Box3().setFromObject(this.head).max.y + 0.14);

    this.props = {}; // action props (chopsticks, cat ears…), created when first needed
    this.pose = restPose();
    this.phase = 0; // walk cycle
    this.walk = 0; // 0 idle … 1 walking (smoothed)
    this.time = 0;
    this.nextBlink = 2;
    this.ik = [{ target: null, weight: 0, goal: 0 }, { target: null, weight: 0, goal: 0 }]; // right, left hand
    this.tmp = { target: new THREE.Vector3(), palm: new THREE.Vector3(), tip: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
  }

  // ── Building blocks ────────────────────────────────────────────────
  /** A hand: palm + four fingers + thumb. Local frame: fingers −Y, palm faces +Z. */
  #buildHand(s, skin) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.066, 0.032), skin);
    palm.position.y = -BODY.palm;
    hand.add(palm);
    const back = new THREE.Mesh(sphere(0.04, 12, 8), skin); // rounds off the back of the hand
    back.scale.set(0.95, 0.85, 0.42);
    back.position.y = -BODY.palm;
    hand.add(back);
    const knuckle = new THREE.Mesh(capsule(0.017, 0.042, 3, 8), skin); // rounded top of the fingers
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.y = -0.066;
    hand.add(knuckle);
    const fingers = {};
    // index → pinky, from the thumb side across.
    [['i', 0.025, 0.031], ['m', 0.008, 0.034], ['r', -0.009, 0.031], ['p', -0.025, 0.025]].forEach(([name, x, len]) => {
      const joint = new THREE.Group();
      joint.position.set(s * x, -0.068, 0);
      const finger = new THREE.Mesh(capsule(0.0105, len, 3, 8), skin);
      finger.position.y = -len / 2 - 0.008;
      joint.add(finger);
      hand.add(joint);
      fingers[name] = joint;
    });
    const thumb = new THREE.Group();
    thumb.position.set(s * 0.036, -0.026, 0.012);
    const t = new THREE.Mesh(capsule(0.012, 0.03, 3, 8), skin);
    t.position.y = -0.024;
    thumb.add(t);
    hand.add(thumb);
    fingers.t = thumb;
    this.fingers.push(fingers);
    return hand;
  }

  /** Little things that move on their own: wings flap, tails sway, the balloon bobs, the pet follows. */
  #animateExtras(dt) {
    if (this.wings) {
      const fast = this.wings.flutter;
      const flap = Math.sin(this.time * (fast ? 9 : 2.4)) * (fast ? 0.22 : 0.12);
      this.wings.list.forEach((w, i) => (w.rotation.y = (i === 0 ? 1 : -1) * flap));
    }
    if (this.tail) {
      this.tail.rotation.y = Math.sin(this.time * (2.2 + this.walk * 3)) * 0.35;
      this.tail.rotation.x = Math.sin(this.time * 1.3) * 0.08;
    }
    if (this.balloon) {
      this.root.updateMatrixWorld(true);
      const at = this.hands[1].localToWorld(this.tmp.target.set(0, -BODY.palm, 0));
      this.balloon.position.copy(this.root.worldToLocal(at));
      this.balloon.rotation.set(Math.sin(this.time * 1.3) * 0.08, 0, Math.sin(this.time * 0.9) * 0.1);
    }
    this.pet?.update(dt, this.root);
  }

  /** Props used by actions, created the first time they're needed. */
  prop(name) {
    if (this.props[name]) return this.props[name];
    let obj;
    if (name === 'chopsticks') {
      // Held in the right hand, pointing forward along the fingers.
      obj = new THREE.Group();
      const wood = mat('#c9a27e');
      for (const dx of [-0.011, 0.011]) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0035, 0.24, 6), wood);
        stick.position.set(dx, -0.09, 0.05);
        stick.rotation.x = -0.75;
        obj.add(stick);
      }
      this.hands[0].add(obj);
    } else if (name === 'bowl') {
      // Sitting on the left palm.
      obj = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f4f1ec', { side: THREE.DoubleSide }));
      const noodles = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), mat('#f2d27a'));
      noodles.rotation.x = -Math.PI / 2;
      noodles.position.y = -0.015;
      bowl.add(noodles);
      bowl.rotation.x = Math.PI / 2; // opening towards the palm side
      bowl.position.set(0, -BODY.palm, 0.075);
      obj.add(bowl);
      this.hands[1].add(obj);
    } else if (name === 'catEars') {
      obj = new THREE.Group();
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 4), this.mats.hair);
        ear.position.set(s * 0.17, 0.3, 0);
        ear.rotation.z = -s * 0.35;
        obj.add(ear);
      }
      this.head.add(obj);
    } else if (name === 'heart') {
      // A little glowing heart between the hands (heart hands).
      obj = new THREE.Mesh(
        new THREE.ExtrudeGeometry(heartShape(0.07), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }).center(),
        new THREE.MeshBasicMaterial({ color: '#ff5c8a', toneMapped: false }),
      );
      obj.position.set(0, 0.8, 0.335); // between the palms (emotes.js → heart)
      this.body.add(obj);
    } else if (name === 'bill') {
      obj = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 10), mat('#f2a33a'));
      obj.rotation.x = Math.PI / 2;
      obj.scale.set(1.3, 1, 0.5);
      obj.position.set(0, -0.08, 0.34);
      this.head.add(obj);
    }
    obj.visible = false;
    this.props[name] = obj;
    return obj;
  }

  /**
   * Reach a hand towards a world-space point (used for holding hands).
   * side: 0 = right hand, 1 = left hand. point: THREE.Vector3, or null to let go.
   */
  setHandTarget(side, point, weight = 1) {
    if (point) this.ik[side].target = point;
    this.ik[side].goal = point ? weight : 0;
  }

  /** World position of a shoulder (0 = right, 1 = left). */
  shoulderWorld(side, out = new THREE.Vector3()) {
    return this.arms[side].getWorldPosition(out);
  }

  /** How much a hand is currently reaching for something (0…1). */
  handWeight(side) {
    return this.ik[side].weight;
  }

  /** World position of a palm (0 = right, 1 = left). */
  handWorld(side, out = new THREE.Vector3()) {
    return this.hands[side].localToWorld(out.set(0, -BODY.palm, 0));
  }

  // ── Animation ──────────────────────────────────────────────────────
  update(dt, speed01, action = null) {
    this.time += dt;
    const p = this.pose;
    Object.assign(p, restPose());
    const zombie = action?.def.walkStyle === 'zombie';
    this.walk += (Math.min(1, speed01 * 1.6) - this.walk) * Math.min(1, dt * 10);
    this.phase += dt * (8 + speed01 * 10) * (zombie ? 0.55 : 1) * (this.walk > 0.02 ? 1 : 0);
    const w = this.walk;
    const s = Math.sin(this.phase);

    // Walking: legs swing with the knee bending on the way back; arms swing.
    p.legRF = s * 0.6 * w;
    p.legLF = -s * 0.6 * w;
    p.kneeR = 0.05 + Math.max(0, -s) * 0.9 * w;
    p.kneeL = 0.05 + Math.max(0, s) * 0.9 * w;
    for (const [side, swing] of [['R', -s * 0.55 * w], ['L', s * 0.55 * w]]) {
      const sx = side === 'R' ? -this.shoulderX : this.shoulderX;
      const reach = 0.38;
      p[`hand${side}X`] = sx + Math.sign(sx) * 0.055;
      p[`hand${side}Y`] = BODY.shoulderY - Math.cos(swing) * reach;
      p[`hand${side}Z`] = Math.sin(swing) * reach + 0.03;
    }
    if (this.held?.carry) {
      // Carrying something (a rose, an ice cream…) in front, in the left hand.
      Object.assign(p, { handLX: this.shoulderX * 0.62, handLY: 0.5, handLZ: 0.2, palmLX: -1, palmLY: 0.1, palmLZ: 0, tipLX: 0, tipLY: 0.1, tipLZ: 1, tipLW: 1 });
      for (const f of FINGERS) p[`L_${f}`] = f === 't' ? 0.55 : 0.85;
    } else if (this.held) {
      for (const f of FINGERS) p[`L_${f}`] = 0.8; // a teddy or a balloon string
    }
    p.bodyY = Math.abs(Math.cos(this.phase)) * 0.05 * w;
    p.bodyRX = 0.08 * w;
    p.headRX = -0.05 * w;

    // Idle: gentle breathing and a little head sway.
    const idle = 1 - w;
    p.bodyY += Math.sin(this.time * 2.2) * 0.008 * idle;
    p.headRZ = Math.sin(this.time * 0.8) * 0.06 * idle;

    // Blink every few seconds.
    this.nextBlink -= dt;
    if (this.nextBlink < 0.12) p.eyesOpen = 0.12;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3.5;

    // Action on top, blended in and out by the emote player.
    const busy = action && action.weight > 0.3;
    const showProps = busy ? action.def.props ?? [] : [];
    if (action && action.weight > 0) {
      const target = action.pose;
      const k = action.weight;
      const walking = action.def.upper;
      for (const key of POSE_KEYS) {
        if (target[key] === undefined) continue;
        if (walking && (key.startsWith('leg') || key.startsWith('knee') || key.startsWith('rig'))) continue; // legs keep walking
        p[key] += (target[key] - p[key]) * k;
      }
    }
    for (const name of showProps) this.prop(name);
    for (const [name, obj] of Object.entries(this.props)) obj.visible = showProps.includes(name);
    if (this.held?.carry) this.held.object.visible = !busy; // the hands are needed for the action

    this.#apply(p, dt);
    this.#animateExtras(dt);
  }

  #apply(p, dt) {
    this.rig.position.set(0, p.rigY + p.rigPivot, p.rigZ);
    this.rig.rotation.set(p.rigRX, p.rigRY, p.rigRZ, 'YXZ');
    this.rigInner.position.y = -p.rigPivot;
    this.body.position.y = p.bodyY;
    this.body.rotation.set(p.bodyRX, p.bodyRY, p.bodyRZ);
    this.torso.scale.y = 1 + Math.sin(this.time * 2.2) * 0.02 * (1 - this.walk);
    this.head.rotation.set(p.headRX, p.headRY, p.headRZ);
    this.legs[0].rotation.x = -p.legRF;
    this.legs[1].rotation.x = -p.legLF;
    this.knees[0].rotation.x = p.kneeR;
    this.knees[1].rotation.x = p.kneeL;
    this.feet[0].rotation.x = p.legRF - p.kneeR;
    this.feet[1].rotation.x = p.legLF - p.kneeL;

    // Face.
    for (const [i, eye] of this.eyes.entries()) {
      const open = Math.max(0.1, p.eyesOpen * (i === 0 ? 1 - p.wink * 0.9 : 1));
      eye.scale.set(p.eyeScale, p.eyeScale * open, p.eyeScale);
    }
    for (const [i, brow] of this.brows.entries()) {
      const side = i === 0 ? -1 : 1;
      brow.position.y = this.browY + p.browY * 0.03 + (1 - Math.min(1, p.eyesOpen + 0.4)) * -0.01;
      brow.rotation.z = side * p.browTilt * 0.35;
    }
    this.blushMat.opacity = Math.min(0.95, this.blushBase + p.blush * 0.45);
    for (const c of this.cheeks) c.scale.setScalar(1 + p.blush * 0.35);
    this.openMouth.visible = p.mouthOpen > 0.05;
    this.openMouth.scale.set(0.8 + p.mouthOpen * 0.3, Math.max(0.05, p.mouthOpen), 1);
    this.kiss.visible = p.pucker > 0.4;
    this.smile.visible = !this.openMouth.visible && !this.kiss.visible;

    // Arms and hands: reach for the pose's hand targets (or a hand being held).
    for (let side = 0; side < 2; side++) {
      const S = side === 0 ? 'R' : 'L';
      const ik = this.ik[side];
      ik.weight += (ik.goal - ik.weight) * Math.min(1, dt * 6);
      const target = this.tmp.target.set(p[`hand${S}X`], p[`hand${S}Y`], p[`hand${S}Z`]);
      const palm = this.tmp.palm.set(p[`palm${S}X`], p[`palm${S}Y`], p[`palm${S}Z`]);
      let grip = 0;
      if (ik.weight > 0.01 && ik.target) {
        this.root.updateMatrixWorld(true);
        const held = this.body.worldToLocal(ik.target.clone());
        target.lerp(held, ik.weight);
        palm.lerp(new THREE.Vector3(side === 0 ? -1 : 1, -0.2, 0.2), ik.weight); // palm towards the other hand
        grip = ik.weight;
      }
      const tip = this.tmp.tip.set(p[`tip${S}X`], p[`tip${S}Y`], p[`tip${S}Z`]);
      this.#solveArm(side, target, palm, tip, p[`tip${S}W`] * (1 - grip));
      const f = this.fingers[side];
      for (const name of FINGERS) {
        const curl = Math.max(p[`${S}_${name}`], name === 't' ? 0 : grip * 0.6);
        if (name === 't') f.t.rotation.set(-curl * 0.9, 0, (side === 0 ? -1 : 1) * (0.55 - curl * 0.6 + p[`${S}_o`] * 2.1));
        else f[name].rotation.set(-curl * 1.75, 0, 0);
      }
      const v = p[`${S}_v`] * (side === 0 ? -1 : 1);
      f.i.rotation.z = v * 0.32;
      f.m.rotation.z = -v * 0.12;
    }
  }

  /**
   * Two-bone arm: bend the elbow so the palm reaches `target` (body space),
   * elbow pointing down/out/back; then turn the hand so the palm faces `palm`
   * (and, with `tipWeight`, bend the wrist so the fingers point along `tipDir`).
   */
  #solveArm(side, target, palmDir, tipDir, tipWeight = 0) {
    const s = side === 0 ? -1 : 1;
    const shoulder = this.arms[side];
    const A = BODY.upperArm;
    const B = BODY.forearm + BODY.palm;
    const S = shoulder.position;
    const toT = target.clone().sub(S);
    let d = toT.length();
    const dir = d > 1e-6 ? toT.divideScalar(d) : DOWN.clone();
    d = Math.min(Math.max(d, Math.abs(A - B) + 0.01), A + B - 0.002);
    const cosA = (A * A + d * d - B * B) / (2 * A * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const pole = new THREE.Vector3(s * 0.45, -0.75, -0.45).normalize();
    const n = pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (n.lengthSq() < 1e-6) n.set(0, 0, -1);
    n.normalize();
    const upper = dir.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(n, Math.sin(alpha)).normalize();
    const elbowPos = S.clone().addScaledVector(upper, A);
    const fore = S.clone().addScaledVector(dir, d).sub(elbowPos).normalize();

    const qS = this.tmp.q.setFromUnitVectors(DOWN, upper);
    shoulder.quaternion.copy(qS);
    const foreLocal = fore.clone().applyQuaternion(qS.clone().invert());
    this.elbows[side].quaternion.setFromUnitVectors(DOWN, foreLocal);

    // Hand: fingers continue the forearm (or bend at the wrist towards tipDir); palm faces palmDir.
    const fingers = fore.clone();
    if (tipWeight > 0.001 && tipDir.lengthSq() > 1e-6) {
      const want = tipDir.clone().normalize();
      const axis = new THREE.Vector3().crossVectors(fore, want);
      if (axis.lengthSq() > 1e-8) fingers.applyAxisAngle(axis.normalize(), Math.min(fore.angleTo(want), WRIST_BEND) * tipWeight);
    }
    const y = fingers.clone().negate();
    const z = palmDir.clone().sub(fingers.clone().multiplyScalar(palmDir.dot(fingers)));
    if (z.lengthSq() < 1e-6) z.copy(n);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const qHand = this.tmp.q2.setFromRotationMatrix(this.tmp.m.makeBasis(x, y, z));
    const qFore = qS.clone().multiply(this.elbows[side].quaternion);
    this.hands[side].quaternion.copy(qFore.invert().multiply(qHand));
  }
}
