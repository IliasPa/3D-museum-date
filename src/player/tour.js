/**
 * The guided tour: walks your avatar through the museum by itself — along
 * each room's walls, stopping in front of every photo (and the mirror) long
 * enough to read its caption, then through the door to the next room, and at
 * last to the heart in the hidden room. Any walking of your own pauses it.
 *
 * It only produces a "joystick" direction each frame (like your thumb would),
 * so walls, benches and other people still stop the avatar as usual.
 */
const ARRIVE = 0.3; // metres: close enough to a waypoint
const STUCK_AFTER = 2.5; // seconds without getting closer → skip that waypoint

/**
 * Waypoints through the museum: { x, z } to walk through, and stops
 * { x, z, look: facing, wait: seconds, item } in front of the photos.
 */
export function tourPath(plan, { hasTable = false } = {}) {
  const steps = [];
  const go = (x, z) => steps.push({ x, z });
  const gallery = plan.rooms.filter((r) => !r.isFinale);
  gallery.forEach((room) => {
    // A loop round the room, a little away from the walls — but outside the benches.
    const inset = Math.max(0.95, Math.min(1.7, room.width / 2 - 2.6 - 0.45));
    const rx0 = room.x0 + inset;
    const rx1 = room.x1 - inset;
    const rz0 = room.z0 + inset;
    const rz1 = room.z1 - inset;
    const W = rx1 - rx0;
    const D = rz1 - rz0;
    const L = 2 * (W + D);
    // Distance along the loop, clockwise from its south-west corner (the walking order of the spots).
    const along = ({ x, z }) => {
      if (Math.abs(x - rx0) < 0.05) return rz1 - z; // west side, going north
      if (Math.abs(z - rz0) < 0.05) return D + (x - rx0); // north side, going east
      if (Math.abs(x - rx1) < 0.05) return D + W + (z - rz0); // east side, going south
      return 2 * D + W + (rx1 - x); // south side, going west
    };
    const corners = [{ x: rx0, z: rz1, p: 0 }, { x: rx0, z: rz0, p: D }, { x: rx1, z: rz0, p: D + W }, { x: rx1, z: rz1, p: 2 * D + W }];
    let p = 0;
    /** Walk along the loop to `to`, round its corners (`wrap`: may go on past the start corner). */
    const walkTo = (to, wrap = false) => {
      let q = along(to);
      if (q < p - 0.01) {
        if (!wrap) return false;
        q += L;
      }
      for (const c of [...corners, ...corners.map((k) => ({ ...k, p: k.p + L }))]) if (c.p > p + 0.01 && c.p < q - 0.01) go(c.x, c.z);
      go(to.x, to.z);
      p = q % L;
      return true;
    };
    // In through the south door (or from the start), then to the loop's first corner.
    go(room.cx, rz1);
    go(rx0, rz1);
    for (const f of plan.frames.filter((fr) => fr.roomIndex === room.index)) {
      const to = { x: Math.min(rx1, Math.max(rx0, f.x + f.nx * inset)), z: Math.min(rz1, Math.max(rz0, f.z + f.nz * inset)) };
      if (f.nx > 0.5) to.x = rx0; // snap onto the loop: the spot's wall decides the side
      else if (f.nx < -0.5) to.x = rx1;
      else if (f.nz > 0.5) to.z = rz0;
      else to.z = rz1;
      if (!walkTo(to)) continue; // never walk backwards round the room
      const words = `${f.photo.title ?? ''} ${f.photo.caption ?? ''}`.length;
      steps.push({ x: to.x, z: to.z, look: Math.atan2(-f.nx, -f.nz), wait: f.photo.isMirror ? 7 : Math.min(9, 3.5 + words / 30), photo: f.photo });
    }
    // On round the loop to the door in the north wall (the next room, or the curtain).
    const door = plan.doors.find((d) => d.south === room.index);
    if (!door) return;
    walkTo({ x: door.x, z: rz0 }, true);
    go(door.x, door.zSouthFace + 0.6);
    if (door.curtain) steps.push({ x: door.x, z: door.zSouthFace + 0.6, finale: true });
    go(door.x, door.zNorthFace - 0.8);
  });
  // The hidden room: the map table (if there is one), then the heart.
  const finale = plan.rooms.find((r) => r.isFinale);
  if (finale) {
    const north = Math.PI; // facing the far wall
    if (hasTable) {
      const tz = finale.cz + 0.75; // mapTable.js → mapTableSpot
      steps.push({ x: finale.cx, z: tz + 1.35, look: north, wait: 6 });
      go(finale.cx + 1.9, tz + 1.0);
      go(finale.cx + 1.9, finale.z0 + 3.4);
      steps.push({ x: finale.cx, z: finale.z0 + 3.2, look: north, wait: 8 });
    } else {
      steps.push({ x: finale.cx, z: finale.cz + 2.1, look: north, wait: 8 });
    }
  }
  return steps;
}

export class Tour {
  constructor(plan, opts = {}) {
    this.steps = tourPath(plan, opts);
    this.index = 0;
    this.waiting = 0;
    this.state = 'off'; // 'off' | 'walking' | 'looking' | 'paused' | 'done'
    this.best = Infinity;
    this.stuck = 0;
    this.onChange = () => {}; // (state, step)
  }

  start() {
    this.index = 0;
    this.#set('walking');
  }

  pause() {
    if (this.state === 'walking' || this.state === 'looking') this.#set('paused');
  }

  resume() {
    if (this.state === 'paused') this.#set('walking');
  }

  stop() {
    this.#set('off');
  }

  /** Skip the photo being looked at (or the next one). */
  next() {
    if (this.state === 'looking') this.waiting = 0;
    else if (this.state === 'walking') this.#advance();
  }

  get active() {
    return this.state === 'walking' || this.state === 'looking';
  }

  /**
   * One frame. Returns the joystick direction for the avatar ({ x, y } in
   * camera space, like Input.move) and turns the avatar / camera while looking.
   * @param ctl     PlayerController
   * @param camYaw  the camera's yaw
   * @param blocked () => true if the way on is closed (the curtain is locked)
   */
  update(dt, ctl, camYaw, blocked = () => false) {
    const none = { x: 0, y: 0 };
    if (!this.active) return none;
    const step = this.steps[this.index];
    if (!step) {
      this.#set('done');
      return none;
    }
    if (step.finale && blocked()) {
      this.#set('done', step);
      return none;
    }
    if (this.state === 'looking') {
      ctl.facing += Math.atan2(Math.sin(step.look - ctl.facing), Math.cos(step.look - ctl.facing)) * Math.min(1, dt * 5);
      this.waiting -= dt;
      if (this.waiting <= 0) this.#advance();
      return none;
    }
    const dx = step.x - ctl.position.x;
    const dz = step.z - ctl.position.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE) {
      if (step.look != null) {
        this.waiting = step.wait;
        this.#set('looking', step);
      } else this.#advance();
      return none;
    }
    // Not getting any closer (someone in the way)? Move on.
    if (d < this.best - 0.05) {
      this.best = d;
      this.stuck = 0;
    } else if ((this.stuck += dt) > STUCK_AFTER) {
      this.#advance();
      return none;
    }
    // World direction → camera-space joystick (see PlayerController.update).
    const ux = dx / d;
    const uz = dz / d;
    const slow = Math.min(1, d / 0.8) * 0.75; // a calm walking pace, slowing down on arrival
    return { x: (ux * Math.cos(camYaw) - uz * Math.sin(camYaw)) * slow, y: (-ux * Math.sin(camYaw) - uz * Math.cos(camYaw)) * slow };
  }

  #advance() {
    this.index++;
    this.best = Infinity;
    this.stuck = 0;
    if (this.index >= this.steps.length) this.#set('done');
    else this.#set('walking');
  }

  #set(state, step = null) {
    if (this.state === state && state !== 'looking') return;
    this.state = state;
    this.onChange(state, step);
  }
}
