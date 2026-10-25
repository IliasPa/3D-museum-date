/**
 * Moves the avatar: camera-relative walking, smooth acceleration, turning to
 * face the walking direction, wall collisions — and sitting on benches.
 * (The avatar's animation itself is driven by game.js.)
 */
import { Vector3 } from 'three';
import { resolveCircle } from '../world/collision.js';

const RADIUS = 0.32; // avatar footprint (m)
const HEIGHT = 1.3; // boxes above this (door lintels) don't block walking

export class PlayerController {
  constructor(avatar, colliders, controls, start) {
    this.avatar = avatar; // can be replaced at any time (e.g. a new look)
    this.colliders = colliders;
    this.walkSpeed = controls.walkSpeed;
    this.runSpeed = controls.runSpeed;
    this.position = new Vector3(start.x, 0, start.z);
    this.vx = 0;
    this.vz = 0;
    this.facing = Math.PI; // start facing north (−Z)
    this.locked = false; // true during actions you can't walk out of (flip, fall…)
    this.speedFactor = 1; // e.g. slower zombie steps
    this.seat = null; // { x, z, facing } while sitting
    this.onStandRequest = () => {}; // walking while seated → stand up
    this.#syncAvatar();
  }

  #syncAvatar() {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.facing;
  }

  /** Current speed 0…1 (relative to running). */
  get speed01() {
    return Math.hypot(this.vx, this.vz) / this.runSpeed;
  }

  /** Sit on a bench seat, facing the way the bench faces. */
  sit(seat) {
    this.seat = seat;
    this.vx = this.vz = 0;
  }

  /** Stand up, stepping off the front of the bench. */
  stand() {
    if (!this.seat) return;
    this.position.x = this.seat.x + Math.sin(this.seat.facing) * 0.75;
    this.position.z = this.seat.z + Math.cos(this.seat.facing) * 0.75;
    this.seat = null;
    this.#syncAvatar();
  }

  /**
   * @param move   {x, y} from Input: x = right, y = forward (length ≤ 1)
   * @param run    whether to run
   * @param camYaw camera yaw, so "forward" means "away from the camera"
   */
  update(dt, move, run, camYaw) {
    if (this.seat) {
      // Glide onto the seat and turn to face the way the bench faces.
      const k = 1 - Math.exp(-dt * 8);
      this.position.x += (this.seat.x - this.position.x) * k;
      this.position.z += (this.seat.z - this.position.z) * k;
      this.#turnTowards(this.seat.facing, dt);
      if (Math.hypot(move.x, move.y) > 0.3) this.onStandRequest();
      this.#syncAvatar();
      return;
    }
    if (this.locked) move = { x: 0, y: 0 };

    // Camera-relative directions on the floor.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    const speed = mag * (run ? this.runSpeed : this.walkSpeed) * this.speedFactor;
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
    if (Math.hypot(this.vx, this.vz) > 0.15) this.#turnTowards(Math.atan2(this.vx, this.vz), dt);
    this.#syncAvatar();
  }

  #turnTowards(target, dt) {
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
    this.facing += diff * (1 - Math.exp(-dt * 12));
  }
}
