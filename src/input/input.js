/**
 * All player input in one place.
 *
 *   Desktop: WASD / arrow keys to walk, Shift to run, drag the mouse to look
 *            around, mouse wheel to zoom, E / Enter / Space or click to open
 *            the photo you're standing at.
 *   Touch:   left side of the screen = floating joystick (push all the way to
 *            run), right side = swipe to look around, tap a photo to open it.
 *
 * Keys use physical positions (event.code), so WASD works on any keyboard
 * layout — Greek included.
 */
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter', 'Space', 'NumpadEnter'],
};
const JOYSTICK_ZONE = 0.45; // left 45% of the screen starts the joystick
const JOYSTICK_RADIUS = 56; // px the knob can travel
const TAP_SLOP = 10; // px a finger may move and still count as a tap

export class Input {
  constructor(canvas, joystickEl, config) {
    this.canvas = canvas;
    this.joystickEl = joystickEl;
    this.knobEl = joystickEl.querySelector('.joystick-knob');
    this.sensitivity = config.controls.lookSensitivity;

    this.enabled = false; // turned on after "Enter"; off while a photo is open
    this.move = { x: 0, y: 0 }; // x = right, y = forward, length ≤ 1
    this.run = false;
    this.lookDelta = { x: 0, y: 0 }; // radians to rotate the camera this frame
    this.zoomDelta = 0;
    this.onTap = null; // (clientX, clientY) => void
    this.onInteract = null; // () => void
    this.usingTouch = matchMedia('(pointer: coarse)').matches;

    this.keys = new Set();
    this.stick = null; // { id, cx, cy, x, y }
    this.look = null; // { id, x, y, startX, startY, startTime, moved }

    this.#bindKeyboard();
    this.#bindPointer();
  }

  /** Turn input on/off. The joystick only appears while playing on a touch screen. */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.joystickEl.hidden = !(enabled && this.usingTouch);
  }

  /** Call once per frame: combines keyboard and joystick into this.move. */
  update() {
    if (!this.enabled) {
      this.move.x = this.move.y = 0;
      this.run = false;
      return;
    }
    const k = (list) => (list.some((c) => this.keys.has(c)) ? 1 : 0);
    let x = k(KEYS.right) - k(KEYS.left);
    let y = k(KEYS.forward) - k(KEYS.back);
    let run = k(KEYS.run) === 1;
    if (this.stick) {
      x += this.stick.x;
      y += this.stick.y;
      if (Math.hypot(this.stick.x, this.stick.y) > 0.92) run = true;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    this.run = run;
  }

  /** Camera rotation since last frame (radians); resets after reading. */
  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = this.lookDelta.y = 0;
    return d;
  }

  consumeZoom() {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  // ── Keyboard ──────────────────────────────────────────────────────
  #bindKeyboard() {
    const all = new Set(Object.values(KEYS).flat());
    addEventListener('keydown', (e) => {
      if (!all.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLButtonElement && KEYS.interact.includes(e.code)) return; // let buttons work
      e.preventDefault();
      if (!this.enabled) return;
      if (KEYS.interact.includes(e.code) && !e.repeat) this.onInteract?.();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear()); // don't keep walking after alt-tab
  }

  // ── Mouse, touch & pen (Pointer Events) ───────────────────────────
  #bindPointer() {
    const c = this.canvas;

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.usingTouch) {
        this.usingTouch = true; // e.g. a touchscreen laptop
        this.setEnabled(this.enabled);
      }
      const inStickZone = e.pointerType === 'touch' && e.clientX < innerWidth * JOYSTICK_ZONE;
      if (inStickZone && !this.stick && this.enabled) {
        this.#startStick(e);
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now(), moved: false, type: e.pointerType };
      }
      try {
        c.setPointerCapture(e.pointerId); // keep receiving moves even outside the canvas
      } catch {}
    });

    c.addEventListener('pointermove', (e) => {
      if (this.stick?.id === e.pointerId) this.#moveStick(e);
      else if (this.look?.id === e.pointerId) {
        const dx = e.clientX - this.look.x;
        const dy = e.clientY - this.look.y;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
        if (Math.hypot(e.clientX - this.look.startX, e.clientY - this.look.startY) > TAP_SLOP) this.look.moved = true;
        if (!this.enabled) return;
        // Touch: a swipe across the screen ≈ 180°. Mouse: fixed speed per pixel.
        const perPx = this.look.type === 'mouse' ? 0.0055 : 3.2 / Math.min(innerWidth, innerHeight);
        this.lookDelta.x += dx * perPx * this.sensitivity;
        this.lookDelta.y += dy * perPx * 0.8 * this.sensitivity;
      }
    });

    const end = (e) => {
      if (this.stick?.id === e.pointerId) this.#endStick();
      else if (this.look?.id === e.pointerId) {
        const isTap = !this.look.moved && performance.now() - this.look.startTime < 450;
        this.look = null;
        if (isTap && e.type === 'pointerup' && this.enabled) this.onTap?.(e.clientX, e.clientY);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('lostpointercapture', end);

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.enabled) this.zoomDelta += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0012;
    }, { passive: false });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: stop pinch-zoom and double-tap-zoom of the whole page.
    for (const type of ['gesturestart', 'gesturechange', 'dblclick']) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
  }

  // ── Floating joystick ─────────────────────────────────────────────
  #startStick(e) {
    // The joystick jumps to wherever the thumb lands (kept on screen).
    const cx = Math.max(JOYSTICK_RADIUS + 12, Math.min(innerWidth - JOYSTICK_RADIUS - 12, e.clientX));
    const cy = Math.max(JOYSTICK_RADIUS + 12, Math.min(innerHeight - JOYSTICK_RADIUS - 12, e.clientY));
    this.stick = { id: e.pointerId, cx, cy, x: 0, y: 0 };
    this.joystickEl.classList.add('active');
    this.joystickEl.style.left = `${cx}px`;
    this.joystickEl.style.top = `${cy}px`;
    this.#moveStick(e);
  }

  #moveStick(e) {
    const s = this.stick;
    const dx = e.clientX - s.cx;
    const dy = e.clientY - s.cy;
    const len = Math.hypot(dx, dy);
    const knob = Math.min(len, JOYSTICK_RADIUS);
    const ux = len > 0 ? dx / len : 0; // direction
    const uy = len > 0 ? dy / len : 0;
    this.knobEl.style.transform = `translate(${ux * knob}px, ${uy * knob}px)`;
    // Small dead zone so a resting thumb doesn't drift, then 0…1.
    const mag = knob / JOYSTICK_RADIUS;
    const out = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    s.x = ux * out;
    s.y = -uy * out; // screen up = walk forward
  }

  #endStick() {
    this.stick = null;
    this.knobEl.style.transform = '';
    this.joystickEl.classList.remove('active');
    this.joystickEl.style.left = '';
    this.joystickEl.style.top = '';
  }

  /** Release everything (used when a photo opens, so nothing keeps moving). */
  reset() {
    this.keys.clear();
    if (this.stick) this.#endStick();
    this.look = null;
    this.lookDelta.x = this.lookDelta.y = 0;
  }
}
