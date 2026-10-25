/**
 * Little hearts that pop up and float away — for the ♥ button, and when two
 * avatars stand close together. All hearts share one draw call.
 */
import * as THREE from 'three';
import { heartShape } from './finale.js';

const POOL = 80;
const COLORS = ['#ff6f91', '#ff9eb5', '#e23a5c', '#ffd1dc'].map((c) => new THREE.Color(c));

export class HeartBursts {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.ShapeGeometry(heartShape(0.2), 8),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, transparent: true, depthWrite: false }),
      POOL,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.hearts = Array.from({ length: POOL }, (_, i) => {
      this.mesh.setColorAt(i, COLORS[i % COLORS.length]);
      return { life: 0 };
    });
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.hideAll();
    scene.add(this.mesh);
  }

  hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < POOL; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Spawn `count` hearts around a point (x, y, z). */
  burst(x, y, z, count = 8, spread = 0.35) {
    for (let k = 0; k < count; k++) {
      const h = this.hearts[this.next];
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      Object.assign(h, {
        x: x + Math.cos(a) * spread * Math.random(),
        y: y + Math.random() * 0.2,
        z: z + Math.sin(a) * spread * Math.random(),
        vx: Math.cos(a) * 0.25,
        vz: Math.sin(a) * 0.25,
        vy: 0.6 + Math.random() * 0.5,
        spin: (Math.random() - 0.5) * 4,
        life: 1.6 + Math.random() * 0.8,
        age: 0,
        size: 0.6 + Math.random() * 0.7,
      });
    }
  }

  update(dt, camera) {
    let any = false;
    for (let i = 0; i < POOL; i++) {
      const h = this.hearts[i];
      if (h.life <= 0) continue;
      any = true;
      h.age += dt;
      h.life -= dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.z += h.vz * dt;
      const grow = Math.min(1, h.age / 0.25);
      const shrink = Math.min(1, Math.max(0, h.life) / 0.5);
      this.dummy.position.set(h.x, h.y, h.z);
      this.dummy.quaternion.copy(camera.quaternion); // always face the camera
      this.dummy.rotateZ(Math.sin(h.age * 3 + h.spin) * 0.3);
      this.dummy.scale.setScalar(h.size * grow * shrink + 1e-4);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any || this.wasActive) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasActive = any;
  }
}
