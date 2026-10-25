/**
 * Third-person camera that orbits the avatar. It's rotated by mouse drag /
 * swipe, zoomed with the wheel, and pulled closer when a wall gets between
 * it and the avatar (so it never looks through walls).
 */
import * as THREE from 'three';
import { raycastBoxes } from '../world/collision.js';

const LOOK_HEIGHT = 1.2; // the camera looks at this height above the avatar's feet
const MIN_PITCH = -0.2; // a little below the head (to look up at photos)
const MAX_PITCH = 0.9;

export class CameraRig {
  constructor(camera, cameraConfig) {
    this.camera = camera;
    this.yaw = 0; // 0 = camera south of the avatar, looking north
    this.pitch = cameraConfig.pitch;
    this.distance = cameraConfig.distance;
    this.minDistance = cameraConfig.minDistance;
    this.maxDistance = cameraConfig.maxDistance;
    this.current = this.distance; // actual distance after wall checks
    this.target = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.initialized = false;
  }

  rotate(dYaw, dPitch) {
    this.yaw -= dYaw;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + dPitch));
  }

  zoom(delta) {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * (1 + delta)));
  }

  update(dt, focus, colliders) {
    const goal = new THREE.Vector3(focus.x, focus.y + LOOK_HEIGHT, focus.z);
    if (!this.initialized) {
      this.target.copy(goal);
      this.initialized = true;
    } else {
      this.target.lerp(goal, 1 - Math.exp(-dt * 14));
    }

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Shorten the boom if a wall (or the ceiling) is in the way.
    const free = raycastBoxes(this.target, this.dir, this.distance, colliders, 0.18);
    const allowed = Math.max(0.5, free - 0.05);
    if (allowed < this.current) this.current = allowed; // snap in: never show a wall's inside
    else this.current += (allowed - this.current) * (1 - Math.exp(-dt * 3)); // ease back out

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.current);
    this.camera.position.y = Math.max(0.25, this.camera.position.y);
    this.camera.lookAt(this.target);
  }
}
