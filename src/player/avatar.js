/**
 * The avatar.
 *
 * Every avatar — the built-in one below or a .glb model (gltfAvatar.js) —
 * has the same tiny interface, so the rest of the game doesn't care which
 * one it gets:
 *
 *   avatar.root                  THREE.Object3D placed & turned by the controller
 *   avatar.update(dt, speed01)   animate; speed01 = 0 standing … 1 running
 *
 * createAvatar() picks one based on config.avatar.type.
 */
import * as THREE from 'three';
import { radialGlowTexture } from '../world/textures.js';
import { lookColors, defaultLook } from './looks.js';

/** `look` = the visitor's chosen colours/hairstyle (see looks.js). */
export async function createAvatar(config, look = defaultLook()) {
  if (config.avatar.type === 'glb') {
    try {
      const { GltfAvatar } = await import('./gltfAvatar.js'); // only downloaded if used
      return await GltfAvatar.load(config.avatar.glb);
    } catch (err) {
      console.error('[avatar] could not load the .glb avatar, using the built-in one instead:', err);
    }
  }
  return new ProceduralAvatar(lookColors(look, config.avatar.colors), look.style);
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
 * A chibi character built from spheres and capsules, flat-shaded for a
 * low-poly look. Faces +Z. About 1.2 m tall.
 * `hairStyle`: 'short' (with a little curl), 'long' or 'bun'.
 */
export class ProceduralAvatar {
  constructor(colors, hairStyle = 'short') {
    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    const skin = mat(colors.skin);
    const hair = mat(colors.hair);
    const shirt = mat(colors.shirt);
    const pants = mat(colors.pants);
    const shoes = mat(colors.shoes);
    const dark = new THREE.MeshBasicMaterial({ color: '#2a1f1d' });
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.root.add(blobShadow());

    // Everything that bobs up and down while walking.
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Legs (pivot at the hip so they can swing).
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0.34, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 3, 8), pants);
      leg.position.y = -0.14;
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), shoes);
      shoe.scale.set(1, 0.6, 1.35);
      shoe.position.set(0, -0.29, 0.03);
      hip.add(leg, shoe);
      this.body.add(hip);
      return hip;
    });

    // Torso: a slightly tapered, rounded sweater.
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 3, 10), shirt);
    this.torso.position.y = 0.56;
    this.torso.scale.set(1, 1, 0.85);
    this.body.add(this.torso);

    // A little heart on the sweater.
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.03);
    heartShape.bezierCurveTo(-0.06, 0.01, -0.03, 0.05, 0, 0.025);
    heartShape.bezierCurveTo(0.03, 0.05, 0.06, 0.01, 0, -0.03);
    const chestHeart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape), new THREE.MeshBasicMaterial({ color: '#fff4f2' }));
    chestHeart.position.set(0, 0.6, 0.172);
    this.body.add(chestHeart);

    // Arms (pivot at the shoulder).
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.24, 0.72, 0);
      shoulder.rotation.z = side * 0.18;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 3, 8), shirt);
      arm.position.y = -0.14;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin);
      hand.position.y = -0.28;
      shoulder.add(arm, hand);
      this.body.add(shoulder);
      return shoulder;
    });

    // Head group (so it can nod a little).
    this.head = new THREE.Group();
    this.head.position.y = 1.0;
    this.body.add(this.head);
    const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), skin);
    this.head.add(face);

    // Hair: a cap over the top and back, plus a little fringe.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.318, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    cap.rotation.x = -0.42;
    cap.position.set(0, 0.02, -0.02);
    this.head.add(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), hair);
    fringe.scale.set(1.6, 0.55, 0.8);
    fringe.position.set(0.05, 0.19, 0.2);
    fringe.rotation.z = -0.25;
    this.head.add(fringe);
    if (hairStyle === 'long') {
      // Long hair falling down the back, past the shoulders.
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.3, 4, 10), hair);
      back.scale.set(1.12, 1, 0.62);
      back.position.set(0, -0.2, -0.14);
      this.head.add(back);
      for (const side of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 3, 8), hair);
        lock.position.set(side * 0.245, -0.2, 0.04);
        this.head.add(lock);
      }
    } else if (hairStyle === 'bun') {
      // A round bun on top.
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), hair);
      bun.position.set(0, 0.33, -0.1);
      this.head.add(bun);
    } else {
      // A little curl on top, so the back of the head is cute too.
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 5, 10, Math.PI * 1.5), hair);
      curl.position.set(0, 0.36, -0.02);
      curl.rotation.set(0, Math.PI / 2, 0.6);
      this.head.add(curl);
    }

    // Eyes with a tiny sparkle.
    this.eyes = [-1, 1].map((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.105, 0.0, 0.27);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), dark);
      pupil.scale.set(1, 1.15, 0.5);
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), white);
      sparkle.position.set(0.012, 0.018, 0.02);
      eye.add(pupil, sparkle);
      this.head.add(eye);
      return eye;
    });

    // Rosy cheeks.
    for (const side of [-1, 1]) {
      const blush = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 12),
        new THREE.MeshBasicMaterial({ color: colors.blush, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      blush.position.set(side * 0.175, -0.07, 0.24);
      blush.rotation.y = side * 0.62;
      this.head.add(blush);
    }

    // Small smile.
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10, Math.PI), dark);
    smile.position.set(0, -0.085, 0.285);
    smile.rotation.z = Math.PI;
    this.head.add(smile);

    this.phase = 0; // walk cycle
    this.walk = 0; // 0 idle … 1 walking (smoothed)
    this.time = 0;
    this.nextBlink = 2;
  }

  update(dt, speed01) {
    this.time += dt;
    this.walk += (Math.min(1, speed01 * 1.6) - this.walk) * Math.min(1, dt * 10);
    this.phase += dt * (8 + speed01 * 10) * (this.walk > 0.02 ? 1 : 0); // quick little steps
    const w = this.walk;
    const s = Math.sin(this.phase);

    // Walking: swing legs and arms, bounce, lean forward slightly.
    this.legs[0].rotation.x = s * 0.7 * w;
    this.legs[1].rotation.x = -s * 0.7 * w;
    this.arms[0].rotation.x = -s * 0.6 * w;
    this.arms[1].rotation.x = s * 0.6 * w;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * w;
    this.body.rotation.x = 0.1 * w;

    // Idle: gentle breathing and a little head sway.
    const idle = 1 - w;
    const breathe = Math.sin(this.time * 2.2);
    this.torso.scale.y = 1 + breathe * 0.025 * idle;
    this.head.position.y = 1.0 + breathe * 0.012 * idle;
    this.head.rotation.z = Math.sin(this.time * 0.8) * 0.06 * idle;
    this.head.rotation.x = -0.05 * w;

    // Blink every few seconds.
    this.nextBlink -= dt;
    const blinking = this.nextBlink < 0.12;
    for (const eye of this.eyes) eye.scale.y = blinking ? 0.12 : 1;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3.5;
  }
}
