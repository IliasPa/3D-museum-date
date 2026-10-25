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

/**
 * Every animatable value of the procedural avatar. Walking/idle fills these
 * in, an emote can override any of them, then they're applied to the body.
 * Arms: F = raise forward, S = raise sideways (outwards), T = twist.
 * Legs: F = swing forward. Rig = the whole body (lying down, flips, jumps),
 * turning around a point `rigPivot` metres above the feet.
 */
export function restPose() {
  return {
    rigY: 0, rigZ: 0, rigRX: 0, rigRY: 0, rigRZ: 0, rigPivot: 0,
    bodyY: 0, bodyRX: 0, bodyRY: 0, bodyRZ: 0,
    headRX: 0, headRY: 0, headRZ: 0,
    armRF: 0, armRS: 0, armRT: 0, armLF: 0, armLS: 0, armLT: 0,
    legRF: 0, legLF: 0,
    eyesOpen: 1, eyeScale: 1, wink: 0, mouthOpen: 0, pucker: 0, blush: 0,
  };
}
const POSE_KEYS = Object.keys(restPose());

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const capsule = (r, l, c = 3, s = 8) => new THREE.CapsuleGeometry(r, l, c, s);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

/**
 * A chibi character built from spheres and capsules, flat-shaded for a
 * low-poly look. Faces +Z. About 1.2 m tall.
 */
export class ProceduralAvatar {
  constructor(look) {
    this.look = look;
    const m = (this.mats = {
      skin: mat(look.skin),
      hair: mat(look.hair),
      top: mat(look.topColor),
      bottom: mat(look.bottomColor),
      shoes: mat(look.shoes),
      dark: new THREE.MeshBasicMaterial({ color: '#2a1f1d' }),
      white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      iris: new THREE.MeshBasicMaterial({ color: look.eyes }),
      mouth: new THREE.MeshBasicMaterial({ color: '#7a2a32' }),
      gold: new THREE.MeshPhongMaterial({ color: '#e0b84c', shininess: 90, specular: '#fff3c0' }),
    });
    const isGirl = look.body === 'girl';
    const bareLegs = look.top === 'dress' || look.bottom !== 'pants';
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

    // ── Legs (pivot at the hip) ──
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0.34, 0);
      const leg = new THREE.Mesh(capsule(0.075, 0.16), bareLegs ? m.skin : m.bottom);
      leg.position.y = -0.14;
      hip.add(leg);
      if (look.top !== 'dress' && look.bottom === 'shorts') {
        const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.12, 10), m.bottom);
        shorts.position.y = -0.03;
        hip.add(shorts);
      }
      const shoe = new THREE.Mesh(sphere(0.09, 8, 6), m.shoes);
      shoe.scale.set(1, 0.6, 1.35);
      shoe.position.set(0, -0.29, 0.03);
      hip.add(shoe);
      this.body.add(hip);
      return hip;
    });

    // ── Torso and clothes ──
    this.torso = new THREE.Mesh(capsule(0.2, 0.2, 3, 10), m.top);
    this.torso.position.y = 0.56;
    this.torsoWidth = isGirl ? 0.92 : 1.04;
    this.torso.scale.set(this.torsoWidth, 1, 0.85);
    this.body.add(this.torso);
    if (look.top === 'dress' || look.bottom === 'skirt') {
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.31, 0.26, 14, 1, true),
        mat(look.top === 'dress' ? look.topColor : look.bottomColor, { side: THREE.DoubleSide }),
      );
      skirt.position.y = 0.33;
      this.body.add(skirt);
    }
    if (look.top === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.075, 6, 12, Math.PI * 1.25), m.top);
      hood.position.set(0, 0.78, -0.08);
      hood.rotation.set(-0.5, 0, Math.PI * 1.375);
      this.body.add(hood);
      for (const s of [-1, 1]) {
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), m.white);
        string.position.set(s * 0.05, 0.66, 0.17);
        this.body.add(string);
      }
    }
    if (look.extra === 'heart' && look.top !== 'dress') {
      const chestHeart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.11)), new THREE.MeshBasicMaterial({ color: '#fff4f2' }));
      chestHeart.position.set(0, 0.6, 0.173);
      this.body.add(chestHeart);
    }
    if (look.extra === 'scarf') {
      const red = mat('#c0392b');
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 14), red);
      scarf.position.y = 0.76;
      scarf.rotation.x = Math.PI / 2;
      const tail = new THREE.Mesh(capsule(0.04, 0.12), red);
      tail.position.set(0.09, 0.66, 0.15);
      this.body.add(scarf, tail);
    }
    if (look.extra === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), mat('#d98a3d'));
      pack.position.set(0, 0.58, -0.22);
      this.body.add(pack);
    }

    // ── Arms (pivot at the shoulder); hands are attach points for props ──
    this.hands = [];
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (isGirl ? 0.22 : 0.245), 0.72, 0);
      const arm = new THREE.Mesh(capsule(0.06, 0.18), longSleeves ? m.top : m.skin);
      arm.position.y = -0.14;
      shoulder.add(arm);
      if (!longSleeves) {
        const sleeve = new THREE.Mesh(capsule(0.07, 0.04), m.top);
        sleeve.position.y = -0.05;
        shoulder.add(sleeve);
      }
      const hand = new THREE.Group();
      hand.position.y = -0.28;
      hand.add(new THREE.Mesh(sphere(0.065, 8, 6), m.skin));
      shoulder.add(hand);
      this.hands.push(hand);
      this.body.add(shoulder);
      return shoulder;
    });

    // ── Head ──
    this.head = new THREE.Group();
    this.head.position.y = 1.0;
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), m.skin));
    this.#buildHair(look);
    this.#buildFace(look, isGirl);
    this.#buildHat(look);
    this.#buildGlasses(look);
    if (look.extra === 'earrings') {
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(sphere(0.025, 6, 4), m.gold);
        e.position.set(s * 0.29, -0.1, 0.02);
        this.head.add(e);
      }
    }

    this.props = {}; // emote props (chopsticks, cat ears…), created when first needed
    this.pose = restPose();
    this.phase = 0; // walk cycle
    this.walk = 0; // 0 idle … 1 walking (smoothed)
    this.time = 0;
    this.nextBlink = 2;
    this.ik = [{ target: null, weight: 0, goal: 0 }, { target: null, weight: 0, goal: 0 }]; // right, left hand
  }

  // ── Building blocks ────────────────────────────────────────────────
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
    const cap = new THREE.Mesh(new THREE.SphereGeometry(buzz ? 0.306 : 0.318, 14, 9, 0, Math.PI * 2, 0, Math.PI * (buzz ? 0.5 : 0.56)), hair);
    cap.rotation.x = -0.42;
    add(cap, 0, 0.02, -0.02);
    if (buzz) return;

    if (style !== 'curly') {
      const side = style === 'side';
      const fringe = add(new THREE.Mesh(sphere(0.16, 8, 6), hair), side ? 0.09 : 0.05, 0.19, 0.2);
      fringe.scale.set(side ? 1.9 : 1.6, 0.55, 0.8);
      fringe.rotation.z = side ? -0.45 : -0.25;
    }
    if (style === 'short') {
      const curl = add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 5, 10, Math.PI * 1.5), hair), 0, 0.36, -0.02);
      curl.rotation.set(0, Math.PI / 2, 0.6);
    } else if (style === 'curly') {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const ring = i % 3;
        const r = 0.27 - ring * 0.07;
        add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.085 - ring * 0.01, 0), hair), Math.cos(a) * r, 0.12 + ring * 0.1, Math.sin(a) * r - 0.03);
      }
    } else if (style === 'long' || style === 'bob') {
      const long = style === 'long';
      const back = add(new THREE.Mesh(capsule(0.25, long ? 0.3 : 0.08, 4, 10), hair), 0, long ? -0.2 : -0.08, -0.14);
      back.scale.set(1.12, 1, 0.62);
      for (const s of [-1, 1]) add(new THREE.Mesh(capsule(0.075, long ? 0.26 : 0.12), hair), s * 0.245, long ? -0.2 : -0.1, 0.04);
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
    // Eyes: coloured iris, dark pupil, a tiny sparkle (+ lashes for girls).
    this.eyes = [-1, 1].map((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.105, 0, 0.27);
      const iris = new THREE.Mesh(sphere(0.045), m.iris);
      iris.scale.set(1, 1.15, 0.5);
      const pupil = new THREE.Mesh(sphere(0.025, 8, 6), m.dark);
      pupil.position.z = 0.018;
      pupil.scale.set(1, 1.15, 0.5);
      const sparkle = new THREE.Mesh(sphere(0.013, 6, 4), m.white);
      sparkle.position.set(0.012, 0.02, 0.026);
      eye.add(iris, pupil, sparkle);
      if (isGirl) {
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.01), m.dark);
        lash.position.set(side * 0.01, 0.055, 0.012);
        lash.rotation.z = -side * 0.25;
        eye.add(lash);
      }
      this.head.add(eye);
      return eye;
    });

    // Rosy cheeks (they glow brighter when blushing).
    this.blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.5, depthWrite: false });
    this.cheeks = [-1, 1].map((side) => {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.048, 12), this.blushMat);
      blush.position.set(side * 0.175, -0.07, 0.24);
      blush.rotation.y = side * 0.62;
      this.head.add(blush);
      return blush;
    });

    // Mouth: a smile, an open mouth (laughing, yawning…) and a kiss.
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10, Math.PI), m.dark);
    this.smile.position.set(0, -0.085, 0.285);
    this.smile.rotation.z = Math.PI;
    this.openMouth = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), m.mouth);
    this.openMouth.position.set(0, -0.1, 0.289);
    this.kiss = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.009, 5, 10), new THREE.MeshBasicMaterial({ color: '#d4506a' }));
    this.kiss.position.set(0, -0.09, 0.29);
    this.head.add(this.smile, this.openMouth, this.kiss);

    if (look.face === 'freckles') {
      const brown = mat('#a0603d');
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const f = new THREE.Mesh(sphere(0.007, 4, 3), brown);
          f.position.set(s * (0.14 + (i % 2) * 0.03), -0.03 - Math.floor(i / 2) * 0.025, 0.265);
          this.head.add(f);
        }
      }
    } else if (look.face === 'stubble' || look.face === 'beard') {
      // The lower front of a slightly larger sphere = a beard around the jaw.
      const full = look.face === 'beard';
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(full ? 0.31 : 0.303, 14, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.55, Math.PI * 0.35),
        full ? m.hair : new THREE.MeshBasicMaterial({ color: look.hair, transparent: true, opacity: 0.35 }),
      );
      this.head.add(beard);
    }
    if (look.face === 'mustache' || look.face === 'beard') {
      for (const s of [-1, 1]) {
        const half = new THREE.Mesh(capsule(0.018, 0.04, 2, 6), m.hair);
        half.position.set(s * 0.03, -0.055, 0.292);
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
    g.position.set(0, 0.005, 0.29);
    const frame = mat(kind === 'hearts' ? '#e23a5c' : '#222222');
    for (const s of [-1, 1]) {
      let lens;
      if (kind === 'round') lens = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 4, 16), frame);
      else if (kind === 'sunglasses') lens = new THREE.Mesh(new THREE.CircleGeometry(0.062, 14), new THREE.MeshBasicMaterial({ color: '#141414' }));
      else lens = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.15)), new THREE.MeshBasicMaterial({ color: '#e23a5c', transparent: true, opacity: 0.85 }));
      lens.position.x = s * 0.105;
      g.add(lens);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), frame)); // bridge
    this.head.add(g);
  }

  /** Props used by emotes, created the first time they're needed. */
  prop(name) {
    if (this.props[name]) return this.props[name];
    let obj;
    if (name === 'chopsticks') {
      obj = new THREE.Group();
      const wood = mat('#c9a27e');
      for (const dx of [-0.012, 0.012]) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.24, 4), wood);
        stick.position.set(dx, 0.06, 0.06);
        stick.rotation.x = 1.1;
        obj.add(stick);
      }
      this.hands[0].add(obj); // right hand
    } else if (name === 'bowl') {
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f4f1ec', { side: THREE.DoubleSide }));
      obj.position.set(0, -0.03, 0.04);
      const noodles = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), mat('#f2d27a'));
      noodles.rotation.x = -Math.PI / 2;
      noodles.position.y = -0.02;
      obj.add(noodles);
      this.hands[1].add(obj); // left hand
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
      obj.position.set(0, -0.08, 0.33);
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

  /** World position of a hand (0 = right, 1 = left). */
  handWorld(side, out = new THREE.Vector3()) {
    return this.hands[side].getWorldPosition(out);
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

    // Walking: swing legs and arms, bounce, lean forward slightly.
    p.legRF = s * 0.7 * w;
    p.legLF = -s * 0.7 * w;
    p.armRF = -s * 0.6 * w;
    p.armLF = s * 0.6 * w;
    p.bodyY = Math.abs(Math.cos(this.phase)) * 0.06 * w;
    p.bodyRX = 0.1 * w;
    p.headRX = -0.05 * w;

    // Idle: gentle breathing and a little head sway.
    const idle = 1 - w;
    p.bodyY += Math.sin(this.time * 2.2) * 0.008 * idle;
    p.headRZ = Math.sin(this.time * 0.8) * 0.06 * idle;

    // Blink every few seconds.
    this.nextBlink -= dt;
    if (this.nextBlink < 0.12) p.eyesOpen = 0.12;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3.5;

    // Emote on top, blended in and out by the emote player.
    const showProps = action && action.weight > 0.3 ? action.def.props ?? [] : [];
    if (action && action.weight > 0) {
      const target = action.pose;
      const k = action.weight;
      for (const key of POSE_KEYS) {
        if (target[key] === undefined) continue;
        if (action.def.upper && (key.startsWith('leg') || key.startsWith('rig'))) continue; // legs keep walking
        p[key] += (target[key] - p[key]) * k;
      }
    }
    for (const name of showProps) this.prop(name);
    for (const [name, obj] of Object.entries(this.props)) obj.visible = showProps.includes(name);

    this.#apply(p);
    this.#applyHands(dt);
  }

  #apply(p) {
    this.rig.position.set(0, p.rigY + p.rigPivot, p.rigZ);
    this.rig.rotation.set(p.rigRX, p.rigRY, p.rigRZ, 'YXZ');
    this.rigInner.position.y = -p.rigPivot;
    this.body.position.y = p.bodyY;
    this.body.rotation.set(p.bodyRX, p.bodyRY, p.bodyRZ);
    this.torso.scale.y = 1 + Math.sin(this.time * 2.2) * 0.02 * (1 - this.walk);
    this.head.rotation.set(p.headRX, p.headRY, p.headRZ);
    // Arms: [0] = right (−x), [1] = left (+x). At rest they hang slightly outwards.
    this.arms[0].rotation.set(-p.armRF, p.armRT, -(0.18 + p.armRS));
    this.arms[1].rotation.set(-p.armLF, -p.armLT, 0.18 + p.armLS);
    this.legs[0].rotation.x = -p.legRF;
    this.legs[1].rotation.x = -p.legLF;
    for (const [i, eye] of this.eyes.entries()) {
      const open = Math.max(0.1, p.eyesOpen * (i === 0 ? 1 - p.wink * 0.9 : 1));
      eye.scale.set(p.eyeScale, p.eyeScale * open, p.eyeScale);
    }
    this.blushMat.opacity = Math.min(0.95, 0.5 + p.blush * 0.45);
    for (const c of this.cheeks) c.scale.setScalar(1 + p.blush * 0.35);
    this.openMouth.visible = p.mouthOpen > 0.05;
    this.openMouth.scale.set(0.8 + p.mouthOpen * 0.3, Math.max(0.05, p.mouthOpen), 1);
    this.kiss.visible = p.pucker > 0.4;
    this.smile.visible = !this.openMouth.visible && !this.kiss.visible;
  }

  /** Holding hands: turn an arm so its hand reaches the target point. */
  #applyHands(dt) {
    const down = new THREE.Vector3(0, -1, 0);
    let updated = false;
    for (let side = 0; side < 2; side++) {
      const ik = this.ik[side];
      ik.weight += (ik.goal - ik.weight) * Math.min(1, dt * 6);
      if (ik.weight < 0.01 || !ik.target) continue;
      if (!updated) {
        this.root.updateMatrixWorld(true);
        updated = true;
      }
      const shoulder = this.arms[side];
      const local = this.body.worldToLocal(ik.target.clone()).sub(shoulder.position).normalize();
      shoulder.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(down, local), ik.weight);
    }
  }
}
