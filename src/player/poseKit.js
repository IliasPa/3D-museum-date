/**
 * Building blocks for the avatar's actions (emotes.js, coupleEmotes.js):
 * easing curves, hand poses and gestures, and little effects.
 *
 * Body space: feet at y = 0, head ≈ 1.0 high, facing +z; the avatar's RIGHT
 * is −x and its LEFT is +x.
 */
import * as THREE from 'three';
import { BODY } from './avatar.js';

// ── Little animation helpers ─────────────────────────────────────────
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 between times a and b (eased). */
export const ramp = (t, a, b) => smooth(clamp((t - a) / (b - a)));
/** Up between a→b, down between c→d. */
export const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
export const lerp = (a, b, k) => a + (b - a) * k;
/** An angle folded back into −π…π (so a full flip ends at 0, not −2π). */
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const TAU = Math.PI * 2;

// ── Legs and lying down ──────────────────────────────────────────────
/** How far the hips drop when the thighs swing forward by `leg` and the knees bend by `knee` — lower the body by this and the feet stay on the floor. */
export const legDrop = (leg, knee) => BODY.thigh * (1 - Math.cos(leg)) + BODY.shin * (1 - Math.cos(leg - knee));
/** Lying on the back: reclined a little, so the big head rests on the floor like a pillow while the heels touch it too. */
export const ON_BACK = { rigRX: -(Math.PI / 2 - 0.28), rigY: 0.06 };

// ── Hands ────────────────────────────────────────────────────────────
/** Finger curls (0 straight … 1 fist) for each gesture; v = ✌️ spread. */
export const GESTURES = {
  relaxed: { t: 0.2, i: 0.3, m: 0.3, r: 0.3, p: 0.3, v: 0 },
  open: { t: 0, i: 0, m: 0, r: 0, p: 0, v: 0.25 },
  fist: { t: 0.75, i: 1, m: 1, r: 1, p: 1, v: 0 },
  point: { t: 0.7, i: 0, m: 1, r: 1, p: 1, v: 0 },
  peace: { t: 0.8, i: 0, m: 0, r: 1, p: 1, v: 1 },
  paw: { t: 0.5, i: 0.7, m: 0.7, r: 0.7, p: 0.7, v: 0 },
  pinch: { t: 0.5, i: 0.3, m: 0.4, r: 0.85, p: 0.9, v: 0 },
  cup: { t: 0.25, i: 0.25, m: 0.25, r: 0.25, p: 0.25, v: 0 },
  claw: { t: 0.3, i: 0.45, m: 0.45, r: 0.45, p: 0.45, v: 0.3 },
  heart: { t: 0, i: 0.55, m: 0.6, r: 0.65, p: 0.7, v: 0, o: 1 }, // o: thumbs turned down
};
/** Fingers wiggling (tickling). */
export const wiggle = (t) => ({ t: 0.4, i: 0.5 + 0.5 * Math.sin(t * 30), m: 0.5 + 0.5 * Math.sin(t * 30 + 1), r: 0.5 + 0.5 * Math.sin(t * 30 + 2), p: 0.5 + 0.5 * Math.sin(t * 30 + 3), v: 0.2 });

/**
 * One hand: where the palm goes (body space: feet at 0, head ≈ 1.0 high,
 * facing +z, the avatar's right is −x), which way it faces, a gesture
 * (a name from GESTURES or curls like wiggle()) and, optionally, which way
 * the fingers point (the wrist bends; otherwise they follow the forearm).
 */
export function hand(S, [x, y, z], palm, gesture, tip) {
  const out = { [`hand${S}X`]: x, [`hand${S}Y`]: y, [`hand${S}Z`]: z };
  if (palm) Object.assign(out, { [`palm${S}X`]: palm[0], [`palm${S}Y`]: palm[1], [`palm${S}Z`]: palm[2] });
  if (tip) Object.assign(out, { [`tip${S}X`]: tip[0], [`tip${S}Y`]: tip[1], [`tip${S}Z`]: tip[2], [`tip${S}W`]: 1 });
  const g = typeof gesture === 'string' ? GESTURES[gesture] : gesture;
  if (g) for (const f of ['t', 'i', 'm', 'r', 'p', 'v', 'o']) out[`${S}_${f}`] = g[f] ?? 0;
  return out;
}
/** Right and left hand: each [position, palm, gesture, fingertips]. */
export const hands = (r, l) => ({ ...hand('R', ...r), ...hand('L', ...l) });
export const mirror = (v) => v && [-v[0], v[1], v[2]];
/** Both hands mirrored: give the LEFT hand's position/palm/fingertips, the right one copies it. */
export const both = ([x, y, z], palm, gesture, tip) => hands(
  [[-x, y, z], mirror(palm), gesture, mirror(tip)],
  [[x, y, z], palm, gesture, tip],
);
// Palm directions (for the left hand; `both` mirrors them).
export const FORWARD = [0, 0, 1];
export const TO_ME = [0, 0, -1];
export const DOWN = [0, -1, 0];
export const UP = [0, 1, 0];
export const INWARD = [-1, 0, 0];

// ── Effect helpers ───────────────────────────────────────────────────
export const tmp = new THREE.Vector3();
export function bubble(ctx, content, duration) {
  ctx.fx.bubble(ctx.avatar.head ?? ctx.avatar.root, content, duration);
}
export function headPos(ctx) {
  return (ctx.avatar.head ?? ctx.avatar.root).getWorldPosition(new THREE.Vector3());
}
/** Run `fn` every `period` seconds while an action plays. */
export function every(period, fn) {
  return (t, dt, ctx, state) => {
    state.next ??= 0;
    if (t >= state.next) {
      state.next = t + period;
      fn(ctx, t);
    }
  };
}
export function once(at, fn) {
  return (t, dt, ctx, state) => {
    state.done ??= new Set();
    if (t >= at && !state.done.has(at)) {
      state.done.add(at);
      fn(ctx, t);
    }
  };
}

