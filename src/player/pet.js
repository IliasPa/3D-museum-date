/**
 * A little pet that trots after its owner: a cat, a puppy, a bunny, a
 * duckling or a bear cub. It lives in the owner's avatar (so other visitors
 * see it too) but keeps its own place in the world and catches up when the
 * owner walks off.
 */
import * as THREE from 'three';
import { mat, capsule, sphere } from './avatarParts.js';

const SPOT = new THREE.Vector3(0.48, 0, -0.32); // where it likes to be: behind, to the left of the owner
const NEAR = 0.3; // close enough: stop and sit
const TOO_FAR = 5; // lost (e.g. the owner was moved): jump right there

export class Pet {
  constructor(kind, color) {
    this.kind = kind;
    this.object = new THREE.Group();
    this.object.name = 'pet';
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.legs = [];
    this.follow = true; // false = stay right beside the owner (the avatar studio's preview)
    this.time = Math.random() * 10;
    this.world = null; // its position in the world
    this.yaw = 0;
    this.moving = 0;
    this.tmp = new THREE.Vector3();
    this.#build(kind, color);
    this.body.scale.setScalar(1.3);
    this.object.position.copy(SPOT);
  }

  #build(kind, color) {
    const fur = mat(color);
    const light = mat(`#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55).getHexString()}`);
    const dark = new THREE.MeshBasicMaterial({ color: '#2a1f1d' });
    const pink = mat('#ff9eb5');
    const b = this.body;
    const put = (parent, geo, material, x, y, z) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const leg = (x, z, r = 0.026, len = 0.06, material = fur) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.1, z);
      put(hip, capsule(r, len, 3, 8), material, 0, -0.05, 0);
      b.add(hip);
      this.legs.push(hip);
    };
    this.head = new THREE.Group();
    const face = (y, z, r) => {
      this.head.position.set(0, y, z);
      b.add(this.head);
      put(this.head, sphere(r, 20, 14), fur, 0, 0, 0);
      for (const s of [-1, 1]) {
        put(this.head, sphere(r * 0.13, 8, 6), dark, s * r * 0.38, r * 0.15, r * 0.9);
        put(this.head, sphere(r * 0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), s * r * 0.38 + 0.004, r * 0.2, r * 1.0);
      }
    };

    if (kind === 'duck') {
      const yellow = fur;
      put(b, sphere(0.085, 20, 14), yellow, 0, 0.11, 0).scale.set(0.9, 0.85, 1.2);
      face(0.21, 0.07, 0.06);
      const beak = put(this.head, new THREE.ConeGeometry(0.025, 0.055, 12), mat('#f2a33a'), 0, -0.01, 0.07);
      beak.rotation.x = Math.PI / 2;
      beak.scale.set(1.3, 1, 0.55);
      for (const s of [-1, 1]) {
        const wing = put(b, sphere(0.045, 12, 8), yellow, s * 0.075, 0.12, -0.01);
        wing.scale.set(0.35, 0.7, 1.1);
        const foot = new THREE.Group();
        foot.position.set(s * 0.035, 0.04, 0.0);
        const web = put(foot, new THREE.ConeGeometry(0.025, 0.04, 3), mat('#f2a33a'), 0, -0.03, 0.02);
        web.rotation.x = Math.PI / 2;
        web.scale.set(1, 1, 0.3);
        b.add(foot);
        this.legs.push(foot);
      }
      const tail = put(b, new THREE.ConeGeometry(0.03, 0.05, 8), yellow, 0, 0.15, -0.1);
      tail.rotation.x = -2.2;
      this.tail = tail;
      return;
    }
    if (kind === 'bunny') {
      put(b, sphere(0.09, 20, 14), fur, 0, 0.1, -0.01).scale.set(0.95, 0.9, 1.1);
      face(0.2, 0.07, 0.065);
      for (const s of [-1, 1]) {
        const ear = put(this.head, capsule(0.022, 0.1, 3, 8), fur, s * 0.03, 0.1, -0.01);
        ear.rotation.z = -s * 0.15;
        ear.scale.z = 0.55;
        put(ear, capsule(0.012, 0.08, 2, 6), pink, 0, 0, 0.01).scale.z = 0.5;
        put(b, sphere(0.032, 12, 8), fur, s * 0.05, 0.03, 0.06).scale.set(0.8, 0.6, 1.3);
        leg(s * 0.05, -0.04, 0.03, 0.03);
      }
      put(this.head, sphere(0.011, 8, 6), pink, 0, -0.008, 0.064);
      this.tail = put(b, new THREE.IcosahedronGeometry(0.035, 2), light, 0, 0.12, -0.11);
      return;
    }

    // Four-legged: cat, puppy, bear cub.
    const body = put(b, capsule(0.075, 0.12, 4, 14), fur, 0, 0.15, 0);
    body.rotation.x = Math.PI / 2;
    put(b, sphere(0.06, 14, 10), light, 0, 0.135, 0.05).scale.set(0.9, 0.9, 1.3); // belly / chest
    face(0.25, 0.12, kind === 'bear' ? 0.08 : 0.075);
    for (const x of [-0.045, 0.045]) for (const z of [-0.07, 0.07]) leg(x, z);
    const r = kind === 'bear' ? 0.08 : 0.075;
    if (kind === 'cat') {
      for (const s of [-1, 1]) {
        const ear = put(this.head, new THREE.ConeGeometry(0.03, 0.06, 4), fur, s * 0.045, 0.07, -0.005);
        ear.rotation.z = -s * 0.3;
        put(ear, new THREE.ConeGeometry(0.016, 0.035, 3), pink, 0, -0.005, 0.01).scale.z = 0.4;
        for (const y of [0, -0.012]) {
          const whisker = put(this.head, new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 3), dark, s * 0.05, -0.02 + y, 0.065);
          whisker.rotation.z = Math.PI / 2 + s * y * 10;
        }
      }
      put(this.head, sphere(0.01, 8, 6), pink, 0, -0.012, 0.075);
      const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, 0.05, -0.06], [0, 0.14, -0.08], [0, 0.2, -0.04]].map((p) => new THREE.Vector3(...p)));
      this.tail = new THREE.Group();
      this.tail.position.set(0, 0.17, -0.12);
      put(this.tail, new THREE.TubeGeometry(curve, 16, 0.016, 6), fur, 0, 0, 0);
      b.add(this.tail);
    } else {
      const muzzle = put(this.head, sphere(r * 0.5, 14, 10), light, 0, -0.02, r * 0.8);
      muzzle.scale.set(1.1, 0.8, 0.9);
      put(this.head, sphere(r * 0.18, 10, 8), dark, 0, 0.0, r * 1.2);
      for (const s of [-1, 1]) {
        if (kind === 'bear') {
          const ear = put(this.head, sphere(0.03, 12, 8), fur, s * 0.055, 0.06, -0.01);
          ear.scale.z = 0.6;
        } else {
          const ear = put(this.head, capsule(0.024, 0.06, 3, 8), mat(`#${new THREE.Color(color).multiplyScalar(0.75).getHexString()}`), s * 0.07, 0.0, -0.01);
          ear.rotation.z = s * 0.35;
          ear.scale.z = 0.5;
        }
      }
      this.tail = put(b, kind === 'bear' ? sphere(0.03, 10, 8) : capsule(0.016, 0.07, 2, 8), fur, 0, kind === 'bear' ? 0.16 : 0.2, -0.14);
      if (kind !== 'bear') this.tail.rotation.x = -0.7;
      if (kind === 'dog') put(b, new THREE.TorusGeometry(0.05, 0.01, 6, 16), mat('#e8737f'), 0, 0.2, 0.09).rotation.x = Math.PI / 2 - 0.4;
    }
  }

  /** Follow the owner (`root` = the owner's avatar root). */
  update(dt, root) {
    this.time += dt;
    let speed = 0;
    if (this.follow) {
      root.updateMatrixWorld(true);
      const want = root.localToWorld(this.tmp.copy(SPOT));
      if (!this.world || this.world.distanceTo(want) > TOO_FAR) this.world = want.clone();
      const dx = want.x - this.world.x;
      const dz = want.z - this.world.z;
      const d = Math.hypot(dx, dz);
      if (d > NEAR) {
        speed = Math.min(d - NEAR * 0.5, Math.max(1.3, d * 2.6) * dt);
        this.world.x += (dx / d) * speed;
        this.world.z += (dz / d) * speed;
        this.#turnTowards(Math.atan2(dx, dz), dt * 8);
        speed /= Math.max(dt, 1e-3);
      } else {
        this.#turnTowards(root.rotation.y, dt * 2); // settle facing the same way as the owner
      }
      this.object.position.copy(root.worldToLocal(this.tmp.copy(this.world)));
      this.object.rotation.y = this.yaw - root.rotation.y;
    }
    this.moving += ((speed > 0.1 ? 1 : 0) - this.moving) * Math.min(1, dt * 8);

    // Trot (or hop / waddle), wag, breathe.
    const t = this.time;
    const m = this.moving;
    const hop = this.kind === 'bunny';
    this.body.position.y = hop ? Math.abs(Math.sin(t * 9)) * 0.07 * m : Math.abs(Math.sin(t * 14)) * 0.012 * m;
    this.body.rotation.z = this.kind === 'duck' ? Math.sin(t * 12) * 0.12 * m : 0;
    this.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 * m));
    if (this.tail) this.tail.rotation.y = Math.sin(t * (this.kind === 'dog' ? 14 : 4)) * (this.kind === 'dog' ? 0.5 : 0.3);
    this.head.rotation.x = Math.sin(t * 1.7) * 0.06 * (1 - m);
    this.head.rotation.y = Math.sin(t * 0.6) * 0.25 * (1 - m);
  }

  #turnTowards(angle, k) {
    const diff = Math.atan2(Math.sin(angle - this.yaw), Math.cos(angle - this.yaw));
    this.yaw += diff * Math.min(1, k);
  }
}
