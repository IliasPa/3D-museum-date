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
 *   {R,L}_{t,i,m,r,p}  finger curl 0 (straight) … 1 (fist); {R,L}_v = ✌️ spread
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
    legRF: 0, legLF: 0, kneeR: 0.05, kneeL: 0.05,
    eyesOpen: 1, eyeScale: 1, wink: 0, mouthOpen: 0, pucker: 0, blush: 0, browY: 0, browTilt: 0,
  };
  for (const s of ['R', 'L']) {
    for (const f of FINGERS) p[`${s}_${f}`] = f === 't' ? 0.2 : 0.3;
    p[`${s}_v`] = 0;
  }
  return p;
}
const POSE_KEYS = Object.keys(restPose());
const ARM_KEYS = new Set(POSE_KEYS.filter((k) => /^(hand|palm)[RL]|^[RL]_/.test(k)));

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const capsule = (r, l, c = 3, s = 8) => new THREE.CapsuleGeometry(r, l, c, s);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * A chibi character built from simple shapes, flat-shaded for a low-poly
 * look: jointed arms and legs, hands with fingers, an expressive face.
 * Faces +Z. About 1.3 m tall.
 */
export class ProceduralAvatar {
  constructor(look) {
    this.look = look;
    const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
    const m = (this.mats = {
      skin: mat(look.skin),
      skinDark: mat(shade(look.skin, 0.9)),
      hair: mat(look.hair),
      top: mat(look.topColor),
      topDark: mat(shade(look.topColor, 0.82)),
      bottom: mat(look.bottomColor),
      shoes: mat(look.shoes),
      sole: mat('#f2eee8'),
      dark: new THREE.MeshBasicMaterial({ color: '#2a1f1d' }),
      white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      iris: new THREE.MeshBasicMaterial({ color: look.eyes }),
      mouth: new THREE.MeshBasicMaterial({ color: '#7a2a32' }),
      gold: new THREE.MeshPhongMaterial({ color: '#e0b84c', shininess: 90, specular: '#fff3c0' }),
    });
    const isGirl = look.body === 'girl';
    this.shoulderX = BODY.shoulderX[isGirl ? 'girl' : 'guy'];
    const dress = look.top === 'dress';
    const legsCovered = !dress && look.bottom === 'pants';
    const longSleeves = look.top === 'sweater' || look.top === 'hoodie';

    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.root.add(blobShadow());
    // rig → rigInner lets whole-body moves rotate around a chosen pivot height.
    this.rig = new THREE.Group();
    this.rigInner = new THREE.Group();
    this.rig.add(this.rigInner);
    this.root.add(this.rig);
    this.body = new THREE.Group();
    this.rigInner.add(this.body);

    // ── Legs: hip → thigh → knee → shin → shoe ──
    this.legs = [];
    this.knees = [];
    this.feet = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * BODY.hipX, BODY.hipY, 0);
      const thigh = new THREE.Mesh(capsule(0.072, 0.1), legsCovered || (!dress && look.bottom === 'shorts') ? m.bottom : m.skin);
      thigh.position.y = -0.085;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -BODY.thigh;
      const shin = new THREE.Mesh(capsule(0.064, 0.09), legsCovered ? m.bottom : m.skin);
      shin.position.y = -0.07;
      knee.add(shin);
      // The ankle keeps the shoe level with the body (soles flat on the floor).
      const foot = new THREE.Group();
      foot.position.y = -BODY.shin;
      const shoe = new THREE.Mesh(sphere(0.075, 10, 6), m.shoes);
      shoe.scale.set(1, 0.62, 1.45);
      shoe.position.set(0, 0.02, 0.035);
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), m.sole);
      sole.scale.set(1, 1, 1.45);
      sole.position.set(0, -0.015, 0.035); // bottom exactly at y = 0 when standing
      foot.add(shoe, sole);
      knee.add(foot);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push(hip);
      this.knees.push(knee);
      this.feet.push(foot);
    }

    // ── Torso and clothes ──
    this.torso = new THREE.Mesh(capsule(0.19, 0.2, 3, 12), m.top);
    this.torso.position.y = 0.565;
    this.torso.scale.set(isGirl ? 0.93 : 1.04, 1, 0.84);
    this.body.add(this.torso);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), look.top === 'hoodie' ? m.top : m.topDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.765;
    this.body.add(collar);
    if (legsCovered || look.bottom === 'shorts') {
      if (!dress) {
        const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.185, 0.07, 14), m.bottom);
        waist.scale.z = 0.86;
        waist.position.y = 0.41;
        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.012, 4, 18), m.dark);
        belt.rotation.x = Math.PI / 2;
        belt.scale.y = 0.86;
        belt.position.y = 0.44;
        this.body.add(waist, belt);
      }
    }
    if (dress || look.bottom === 'skirt') {
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.3, 0.24, 16, 1, true),
        mat(dress ? look.topColor : look.bottomColor, { side: THREE.DoubleSide }),
      );
      skirt.position.y = 0.36;
      skirt.scale.z = 0.9;
      this.body.add(skirt);
    }
    if (look.top === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.075, 6, 12, Math.PI * 1.25), m.top);
      hood.position.set(0, 0.79, -0.08);
      hood.rotation.set(-0.5, 0, Math.PI * 1.375);
      this.body.add(hood);
      for (const s of [-1, 1]) {
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 4), m.white);
        string.position.set(s * 0.045, 0.69, 0.165);
        this.body.add(string);
      }
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.02), m.topDark);
      pocket.position.set(0, 0.5, 0.16);
      this.body.add(pocket);
    }
    if (look.extra === 'heart' && !dress) {
      const chestHeart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.1)), new THREE.MeshBasicMaterial({ color: '#fff4f2' }));
      chestHeart.position.set(0.0, 0.6, 0.162);
      this.body.add(chestHeart);
    }
    if (look.extra === 'scarf') {
      const red = mat('#c0392b');
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 14), red);
      scarf.position.y = 0.775;
      scarf.rotation.x = Math.PI / 2;
      const tail = new THREE.Mesh(capsule(0.04, 0.12), red);
      tail.position.set(0.08, 0.68, 0.15);
      this.body.add(scarf, tail);
    }
    if (look.extra === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), mat('#d98a3d'));
      pack.position.set(0, 0.58, -0.21);
      this.body.add(pack);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 10), m.skin);
    neck.position.y = 0.8;
    this.body.add(neck);

    // ── Arms: shoulder → upper arm → elbow → forearm → hand with fingers ──
    this.arms = [];
    this.elbows = [];
    this.hands = [];
    this.fingers = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * this.shoulderX, BODY.shoulderY, 0);
      const upper = new THREE.Mesh(capsule(0.058, 0.13), longSleeves || look.top !== 'dress' ? m.top : m.skin);
      upper.position.y = -0.09;
      shoulder.add(upper);
      if (!longSleeves) {
        // Short sleeves: the lower half of the upper arm is bare.
        upper.scale.y = 0.55;
        upper.position.y = -0.05;
        const bare = new THREE.Mesh(capsule(0.05, 0.09), m.skin);
        bare.position.y = -0.11;
        shoulder.add(bare);
      }
      const elbow = new THREE.Group();
      elbow.position.y = -BODY.upperArm;
      const fore = new THREE.Mesh(capsule(0.05, 0.12), longSleeves ? m.top : m.skin);
      fore.position.y = -0.085;
      elbow.add(fore);
      if (longSleeves) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), m.topDark);
        cuff.position.y = -0.16;
        elbow.add(cuff);
      }
      const hand = this.#buildHand(s, m.skin);
      hand.position.y = -BODY.forearm;
      elbow.add(hand);
      shoulder.add(elbow);
      this.body.add(shoulder);
      this.arms.push(shoulder);
      this.elbows.push(elbow);
      this.hands.push(hand);
    }

    // ── Head ──
    this.head = new THREE.Group();
    this.head.position.y = 1.0;
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), m.skin));
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(sphere(0.055, 8, 6), m.skin);
      ear.scale.set(0.45, 0.95, 0.75);
      ear.position.set(s * 0.29, -0.02, 0);
      this.head.add(ear);
    }
    const nose = new THREE.Mesh(sphere(0.026, 8, 6), m.skinDark);
    nose.scale.set(1.1, 0.8, 0.9);
    nose.position.set(0, -0.04, 0.297);
    this.head.add(nose);
    this.#buildHair(look);
    this.#buildFace(look, isGirl);
    this.#buildHat(look);
    this.#buildGlasses(look);
    if (look.extra === 'earrings') {
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(sphere(0.022, 6, 4), m.gold);
        e.position.set(s * 0.295, -0.085, 0.02);
        this.head.add(e);
      }
    }

    this.props = {}; // action props (chopsticks, cat ears…), created when first needed
    this.pose = restPose();
    this.phase = 0; // walk cycle
    this.walk = 0; // 0 idle … 1 walking (smoothed)
    this.time = 0;
    this.nextBlink = 2;
    this.ik = [{ target: null, weight: 0, goal: 0 }, { target: null, weight: 0, goal: 0 }]; // right, left hand
    this.tmp = { target: new THREE.Vector3(), palm: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
  }

  // ── Building blocks ────────────────────────────────────────────────
  /** A hand: palm + four fingers + thumb. Local frame: fingers −Y, palm faces +Z. */
  #buildHand(s, skin) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.066, 0.032), skin);
    palm.position.y = -BODY.palm;
    hand.add(palm);
    const knuckle = new THREE.Mesh(capsule(0.017, 0.042, 2, 6), skin); // rounded top of the fingers
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.y = -0.066;
    hand.add(knuckle);
    const fingers = {};
    // index → pinky, from the thumb side across.
    [['i', 0.025, 0.031], ['m', 0.008, 0.034], ['r', -0.009, 0.031], ['p', -0.025, 0.025]].forEach(([name, x, len]) => {
      const joint = new THREE.Group();
      joint.position.set(s * x, -0.068, 0);
      const finger = new THREE.Mesh(capsule(0.0105, len, 2, 6), skin);
      finger.position.y = -len / 2 - 0.008;
      joint.add(finger);
      hand.add(joint);
      fingers[name] = joint;
    });
    const thumb = new THREE.Group();
    thumb.position.set(s * 0.036, -0.026, 0.012);
    const t = new THREE.Mesh(capsule(0.012, 0.03, 2, 6), skin);
    t.position.y = -0.024;
    thumb.add(t);
    hand.add(thumb);
    fingers.t = thumb;
    this.fingers.push(fingers);
    return hand;
  }

  #buildHair(look) {
    const style = look.hairStyle;
    if (style === 'bald') return;
    const hair = this.mats.hair;
    const add = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      this.head.add(mesh);
      return mesh;
    };
    const buzz = style === 'buzz';
    const cap = new THREE.Mesh(new THREE.SphereGeometry(buzz ? 0.306 : 0.318, 16, 10, 0, Math.PI * 2, 0, Math.PI * (buzz ? 0.5 : 0.56)), hair);
    cap.rotation.x = -0.42;
    add(cap, 0, 0.02, -0.02);
    if (buzz) return;

    if (style !== 'curly') {
      const side = style === 'side';
      const fringe = add(new THREE.Mesh(sphere(0.16, 10, 6), hair), side ? 0.09 : 0.05, 0.19, 0.2);
      fringe.scale.set(side ? 1.9 : 1.6, 0.55, 0.8);
      fringe.rotation.z = side ? -0.45 : -0.25;
      // A couple of locks for a less helmet-like look.
      for (const x of side ? [-0.17] : [-0.15, 0.17]) {
        const lock = add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), hair), x, 0.12, 0.22);
        lock.rotation.set(0.3, 0, Math.PI + x * 1.2);
      }
    }
    if (style === 'short') {
      const curl = add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 5, 10, Math.PI * 1.5), hair), 0, 0.36, -0.02);
      curl.rotation.set(0, Math.PI / 2, 0.6);
    } else if (style === 'curly') {
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 * 3;
        const ring = i % 3;
        const r = 0.28 - ring * 0.08;
        add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.085 - ring * 0.012, 0), hair), Math.cos(a) * r, 0.1 + ring * 0.11, Math.sin(a) * r - 0.04);
      }
    } else if (style === 'long' || style === 'bob') {
      const long = style === 'long';
      const back = add(new THREE.Mesh(capsule(0.25, long ? 0.3 : 0.08, 4, 12), hair), 0, long ? -0.2 : -0.08, -0.14);
      back.scale.set(1.12, 1, 0.62);
      for (const s of [-1, 1]) add(new THREE.Mesh(capsule(0.075, long ? 0.26 : 0.12, 3, 8), hair), s * 0.25, long ? -0.2 : -0.1, 0.04);
    } else if (style === 'ponytail') {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.015, 4, 8), this.mats.gold), 0, 0.12, -0.3);
      const tail = add(new THREE.Mesh(capsule(0.08, 0.26), hair), 0, -0.04, -0.36);
      tail.rotation.x = 0.35;
    } else if (style === 'pigtails') {
      const tie = mat('#e8737f');
      for (const s of [-1, 1]) {
        const tail = add(new THREE.Mesh(capsule(0.07, 0.2), hair), s * 0.33, -0.05, -0.06);
        tail.rotation.z = s * 0.4;
        add(new THREE.Mesh(sphere(0.035, 6, 4), tie), s * 0.29, 0.07, -0.06);
      }
    } else if (style === 'bun') {
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), hair), 0, 0.33, -0.1);
    }
  }

  #buildFace(look, isGirl) {
    const m = this.mats;
    // Eyes: white, coloured iris, dark pupil, a sparkle (+ lashes for girls).
    this.eyes = [-1, 1].map((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.105, 0, 0.268);
      const white = new THREE.Mesh(sphere(0.052, 12, 8), m.white);
      white.scale.set(0.95, 1.12, 0.4);
      const iris = new THREE.Mesh(sphere(0.037, 10, 8), m.iris);
      iris.scale.set(1, 1.15, 0.45);
      iris.position.z = 0.012;
      const pupil = new THREE.Mesh(sphere(0.02, 8, 6), m.dark);
      pupil.scale.set(1, 1.15, 0.45);
      pupil.position.z = 0.022;
      const sparkle = new THREE.Mesh(sphere(0.011, 6, 4), m.white);
      sparkle.position.set(0.012, 0.018, 0.03);
      eye.add(white, iris, pupil, sparkle);
      if (isGirl) {
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.01), m.dark);
        lash.position.set(side * 0.012, 0.058, 0.012);
        lash.rotation.z = -side * 0.25;
        eye.add(lash);
      }
      this.head.add(eye);
      return eye;
    });

    // Eyebrows (they move with the mood).
    this.brows = [-1, 1].map((side) => {
      const brow = new THREE.Mesh(capsule(0.011, 0.05, 2, 6), m.hair);
      brow.rotation.z = Math.PI / 2;
      brow.position.set(side * 0.105, 0.09, 0.272);
      this.head.add(brow);
      return brow;
    });

    // Rosy cheeks (they glow brighter when blushing).
    this.blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.5, depthWrite: false });
    this.cheeks = [-1, 1].map((side) => {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), this.blushMat);
      blush.position.set(side * 0.18, -0.075, 0.236);
      blush.rotation.y = side * 0.65;
      this.head.add(blush);
      return blush;
    });

    // Mouth: a smile, an open mouth with teeth (laughing, yawning…) and a kiss.
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.008, 4, 10, Math.PI), m.dark);
    this.smile.position.set(0, -0.095, 0.284);
    this.smile.rotation.z = Math.PI;
    this.openMouth = new THREE.Group();
    this.openMouth.position.set(0, -0.11, 0.287);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.042, 14), m.mouth);
    const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.014), m.white);
    teeth.position.set(0, 0.024, 0.002);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshBasicMaterial({ color: '#e0707e' }));
    tongue.position.set(0, -0.02, 0.002);
    this.openMouth.add(hole, teeth, tongue);
    this.kiss = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.009, 5, 10), new THREE.MeshBasicMaterial({ color: '#d4506a' }));
    this.kiss.position.set(0, -0.1, 0.29);
    this.head.add(this.smile, this.openMouth, this.kiss);

    if (look.face === 'freckles') {
      const brown = mat('#a0603d');
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const f = new THREE.Mesh(sphere(0.007, 4, 3), brown);
          f.position.set(s * (0.14 + (i % 2) * 0.03), -0.035 - Math.floor(i / 2) * 0.025, 0.263);
          this.head.add(f);
        }
      }
    } else if (look.face === 'stubble' || look.face === 'beard') {
      // The lower front of a slightly larger sphere = a beard around the jaw.
      const full = look.face === 'beard';
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(full ? 0.31 : 0.303, 14, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.58, Math.PI * 0.32),
        full ? m.hair : new THREE.MeshBasicMaterial({ color: look.hair, transparent: true, opacity: 0.35 }),
      );
      this.head.add(beard);
    }
    if (look.face === 'mustache' || look.face === 'beard') {
      for (const s of [-1, 1]) {
        const half = new THREE.Mesh(capsule(0.016, 0.04, 2, 6), m.hair);
        half.position.set(s * 0.03, -0.068, 0.293);
        half.rotation.z = s * 1.2;
        this.head.add(half);
      }
    }
  }

  #buildHat(look) {
    const hat = look.hat;
    if (hat === 'none') return;
    const g = new THREE.Group();
    g.position.set(0, 0.06, -0.02);
    g.rotation.x = -0.25;
    const colour = mat(look.topColor);
    if (hat === 'beanie' || hat === 'cap') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), colour));
      if (hat === 'beanie') {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.04, 6, 18), colour);
        rim.rotation.x = Math.PI / 2;
        const pom = new THREE.Mesh(sphere(0.07, 8, 6), mat('#f4f1ec'));
        pom.position.y = 0.34;
        g.add(rim, pom);
      } else {
        const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 16, 1, false, -Math.PI / 2, Math.PI), colour);
        visor.position.set(0, 0, 0.22);
        visor.scale.set(1, 1, 0.9);
        g.add(visor);
      }
    } else if (hat === 'bow') {
      const pink = mat('#ff6f91');
      for (const s of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 8), pink);
        loop.rotation.z = (s * Math.PI) / 2;
        loop.position.set(0.18 + s * 0.07, 0.26, 0.08);
        g.add(loop);
      }
      const knot = new THREE.Mesh(sphere(0.035, 8, 6), pink);
      knot.position.set(0.18, 0.26, 0.08);
      g.add(knot);
    } else if (hat === 'flowers') {
      const colours = ['#ff9eb5', '#fff3c4', '#ffffff', '#ffc0d0'].map((c) => mat(c));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new THREE.Mesh(sphere(0.045, 6, 4), colours[i % colours.length]);
        f.position.set(Math.cos(a) * 0.29, 0.13, Math.sin(a) * 0.29);
        g.add(f);
      }
    } else if (hat === 'crown') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.09, 14, 1, true), this.mats.gold);
      band.position.y = 0.3;
      g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 5), this.mats.gold);
        spike.position.set(Math.cos(a) * 0.2, 0.38, Math.sin(a) * 0.2);
        g.add(spike);
      }
    }
    this.head.add(g);
  }

  #buildGlasses(look) {
    const kind = look.glasses;
    if (kind === 'none') return;
    const g = new THREE.Group();
    g.position.set(0, 0.005, 0.292);
    const frame = mat(kind === 'hearts' ? '#e23a5c' : '#222222');
    for (const s of [-1, 1]) {
      let lens;
      if (kind === 'round') lens = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.009, 4, 16), frame);
      else if (kind === 'sunglasses') lens = new THREE.Mesh(new THREE.CircleGeometry(0.064, 14), new THREE.MeshBasicMaterial({ color: '#141414' }));
      else lens = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.15)), new THREE.MeshBasicMaterial({ color: '#e23a5c', transparent: true, opacity: 0.85 }));
      lens.position.x = s * 0.105;
      g.add(lens);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), frame)); // bridge
    this.head.add(g);
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
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0035, 0.24, 4), wood);
        stick.position.set(dx, -0.09, 0.05);
        stick.rotation.x = -0.75;
        obj.add(stick);
      }
      this.hands[0].add(obj);
    } else if (name === 'bowl') {
      // Sitting on the left palm.
      obj = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f4f1ec', { side: THREE.DoubleSide }));
      const noodles = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), mat('#f2d27a'));
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
    } else if (name === 'bill') {
      obj = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), mat('#f2a33a'));
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
    const showProps = action && action.weight > 0.3 ? action.def.props ?? [] : [];
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

    this.#apply(p, dt);
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
      brow.position.y = 0.09 + p.browY * 0.03 + (1 - Math.min(1, p.eyesOpen + 0.4)) * -0.01;
      brow.rotation.z = Math.PI / 2 + side * p.browTilt * 0.35;
    }
    this.blushMat.opacity = Math.min(0.95, 0.5 + p.blush * 0.45);
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
      this.#solveArm(side, target, palm);
      const f = this.fingers[side];
      for (const name of FINGERS) {
        const curl = Math.max(p[`${S}_${name}`], name === 't' ? 0 : grip * 0.6);
        if (name === 't') f.t.rotation.set(-curl * 0.9, 0, (side === 0 ? -1 : 1) * (0.55 - curl * 0.6));
        else f[name].rotation.set(-curl * 1.75, 0, 0);
      }
      const v = p[`${S}_v`] * (side === 0 ? -1 : 1);
      f.i.rotation.z = v * 0.32;
      f.m.rotation.z = -v * 0.12;
    }
  }

  /**
   * Two-bone arm: bend the elbow so the palm reaches `target` (body space),
   * elbow pointing down/out/back; then turn the hand so the palm faces `palm`.
   */
  #solveArm(side, target, palmDir) {
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

    // Hand: fingers continue the forearm; palm faces palmDir.
    const y = fore.clone().negate();
    const z = palmDir.clone().sub(fore.clone().multiplyScalar(palmDir.dot(fore)));
    if (z.lengthSq() < 1e-6) z.copy(n);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const qHand = this.tmp.q2.setFromRotationMatrix(this.tmp.m.makeBasis(x, y, z));
    const qFore = qS.clone().multiply(this.elbows[side].quaternion);
    this.hands[side].quaternion.copy(qFore.invert().multiply(qHand));
  }
}
