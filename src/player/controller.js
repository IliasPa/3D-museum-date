/**
 * Moves the avatar: camera-relative walking, smooth acceleration, turning to
 * face the walking direction, and wall collisions.
 */
import { resolveCircle } from '../world/collision.js';

const RADIUS = 0.32; // avatar footprint (m)
const HEIGHT = 1.3; // boxes above this (door lintels) don't block walking

export class PlayerController {
  constructor(avatar, colliders, controls) {
    this.avatar = avatar;
    this.colliders = colliders;
    this.walkSpeed = controls.walkSpeed;
    this.runSpeed = controls.runSpeed;
    this.position = avatar.root.position;
    this.vx = 0;
    this.vz = 0;
    this.facing = Math.PI; // start facing north (−Z)
    avatar.root.rotation.y = this.facing;
  }

  /** Current speed 0…1 (relative to running). */
  get speed01() {
    return Math.hypot(this.vx, this.vz) / this.runSpeed;
  }

  /**
   * @param move   {x, y} from Input: x = right, y = forward (length ≤ 1)
   * @param run    whether to run
   * @param camYaw camera yaw, so "forward" means "away from the camera"
   */
  update(dt, move, run, camYaw) {
    // Camera-relative directions on the floor.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    const speed = mag * (run ? this.runSpeed : this.walkSpeed);
    let tx = rx * move.x + fx * move.y;
    let tz = rz * move.x + fz * move.y;
    const tl = Math.hypot(tx, tz) || 1;
    tx = (tx / tl) * speed;
    tz = (tz / tl) * speed;

    // Ease towards the target velocity (snappy start, gentle stop).
    const k = 1 - Math.exp(-dt * (speed > 0 ? 10 : 12));
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    // Move in small steps, so a big jump on a slow device can't pass through a wall.
    const dx = this.vx * dt;
    const dz = this.vz * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let i = 0; i < steps; i++) {
      this.position.x += dx / steps;
      this.position.z += dz / steps;
      resolveCircle(this.position, RADIUS, this.colliders, HEIGHT);
    }

    // Turn to face the way we're walking.
    const v = Math.hypot(this.vx, this.vz);
    if (v > 0.15) {
      const target = Math.atan2(this.vx, this.vz);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
      this.facing += diff * (1 - Math.exp(-dt * 12));
      this.avatar.root.rotation.y = this.facing;
    }

    this.avatar.update(dt, this.speed01);
  }
}
