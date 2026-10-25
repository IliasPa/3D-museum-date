/**
 * Keeps things smooth on slower phones: if the frame rate stays low for a
 * couple of seconds, render at a slightly lower resolution (never below 1×).
 */
export class AdaptiveResolution {
  constructor(renderer, maxPixelRatio, enabled = true) {
    this.renderer = renderer;
    this.enabled = enabled;
    this.ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    this.frames = [];
    this.timer = 0;
    renderer.setPixelRatio(this.ratio);
  }

  /** Feed it every frame's delta time (seconds). Returns true if it changed the resolution. */
  update(dt) {
    if (!this.enabled || dt > 0.25) return false; // ignore hitches (tab switches etc.)
    this.frames.push(dt);
    this.timer += dt;
    if (this.timer < 2.5) return false;

    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    const jitter = Math.sqrt(this.frames.reduce((a, b) => a + (b - avg) ** 2, 0) / this.frames.length);
    this.frames.length = 0;
    this.timer = 0;

    // A steady ~30 fps with no jitter usually means the phone is in Low Power
    // Mode (which caps the frame rate) — lowering the resolution won't help.
    const capped = Math.abs(avg - 1 / 30) < 0.002 && jitter < 0.002;
    if (avg > 1 / 45 && !capped && this.ratio > 1) {
      this.ratio = Math.max(1, this.ratio - 0.25);
      this.renderer.setPixelRatio(this.ratio);
      console.info(`[museum] lowering render resolution to ${this.ratio}× for smoother motion`);
      return true;
    }
    return false;
  }
}
