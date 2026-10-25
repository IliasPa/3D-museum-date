/**
 * Actions ("emotes"): A = Applaud … Z = Zombie walk, plus the reactions
 * (being hugged, tickled or kissed).
 *
 * Each action describes, over time t (seconds), a pose for the avatar (see
 * restPose() in avatar.js): where the hands go, which way the palms face,
 * what the fingers do (✌️, fist, wave…), the face, legs and whole body —
 * and optionally some effects (bubbles, tears, 💤…). EmotePlayer plays one
 * action at a time, blending it in and out smoothly. The same code animates
 * your avatar and the other person's, so both screens show the same thing.
 */
import * as THREE from 'three';
import { BODY } from './avatar.js';

// ── Little animation helpers ─────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 between times a and b (eased). */
const ramp = (t, a, b) => smooth(clamp((t - a) / (b - a)));
/** Up between a→b, down between c→d. */
const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const lerp = (a, b, k) => a + (b - a) * k;
/** An angle folded back into −π…π (so a full flip ends at 0, not −2π). */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2;

// ── Legs and lying down ──────────────────────────────────────────────
/** How far the hips drop when the thighs swing forward by `leg` and the knees bend by `knee` — lower the body by this and the feet stay on the floor. */
const legDrop = (leg, knee) => BODY.thigh * (1 - Math.cos(leg)) + BODY.shin * (1 - Math.cos(leg - knee));
/** Lying on the back: reclined a little, so the big head rests on the floor like a pillow while the heels touch it too. */
const ON_BACK = { rigRX: -(Math.PI / 2 - 0.28), rigY: 0.06 };

// ── Hands ────────────────────────────────────────────────────────────
/** Finger curls (0 straight … 1 fist) for each gesture; v = ✌️ spread. */
const GESTURES = {
  relaxed: { t: 0.2, i: 0.3, m: 0.3, r: 0.3, p: 0.3, v: 0 },
  open: { t: 0, i: 0, m: 0, r: 0, p: 0, v: 0.25 },
  fist: { t: 0.75, i: 1, m: 1, r: 1, p: 1, v: 0 },
  point: { t: 0.7, i: 0, m: 1, r: 1, p: 1, v: 0 },
  peace: { t: 0.8, i: 0, m: 0, r: 1, p: 1, v: 1 },
  paw: { t: 0.5, i: 0.7, m: 0.7, r: 0.7, p: 0.7, v: 0 },
  pinch: { t: 0.5, i: 0.3, m: 0.4, r: 0.85, p: 0.9, v: 0 },
  cup: { t: 0.25, i: 0.25, m: 0.25, r: 0.25, p: 0.25, v: 0 },
  claw: { t: 0.3, i: 0.45, m: 0.45, r: 0.45, p: 0.45, v: 0.3 },
  heart: { t: 0, i: 0.55, m: 0.55, r: 0.55, p: 0.55, v: 0 },
};
/** Fingers wiggling (tickling). */
const wiggle = (t) => ({ t: 0.4, i: 0.5 + 0.5 * Math.sin(t * 30), m: 0.5 + 0.5 * Math.sin(t * 30 + 1), r: 0.5 + 0.5 * Math.sin(t * 30 + 2), p: 0.5 + 0.5 * Math.sin(t * 30 + 3), v: 0.2 });

/**
 * One hand: where the palm goes (body space: feet at 0, head ≈ 1.0 high,
 * facing +z, the avatar's right is −x), which way it faces, and a gesture
 * (a name from GESTURES or curls like wiggle()).
 */
function hand(S, [x, y, z], palm, gesture) {
  const out = { [`hand${S}X`]: x, [`hand${S}Y`]: y, [`hand${S}Z`]: z };
  if (palm) Object.assign(out, { [`palm${S}X`]: palm[0], [`palm${S}Y`]: palm[1], [`palm${S}Z`]: palm[2] });
  const g = typeof gesture === 'string' ? GESTURES[gesture] : gesture;
  if (g) for (const f of ['t', 'i', 'm', 'r', 'p', 'v']) out[`${S}_${f}`] = g[f];
  return out;
}
/** Right and left hand: each [position, palm, gesture]. */
const hands = (r, l) => ({ ...hand('R', ...r), ...hand('L', ...l) });
/** Both hands mirrored: give the LEFT hand's position/palm, the right one copies it. */
const both = ([x, y, z], palm, gesture) => hands(
  [[-x, y, z], palm && [-palm[0], palm[1], palm[2]], gesture],
  [[x, y, z], palm, gesture],
);
// Palm directions (for the left hand; `both` mirrors them).
const FORWARD = [0, 0, 1];
const TO_ME = [0, 0, -1];
const DOWN = [0, -1, 0];
const UP = [0, 1, 0];
const INWARD = [-1, 0, 0];

// ── Effect helpers ───────────────────────────────────────────────────
const tmp = new THREE.Vector3();
function bubble(ctx, content, duration) {
  ctx.fx.bubble(ctx.avatar.head ?? ctx.avatar.root, content, duration);
}
function headPos(ctx) {
  return (ctx.avatar.head ?? ctx.avatar.root).getWorldPosition(new THREE.Vector3());
}
/** Run `fn` every `period` seconds while an action plays. */
function every(period, fn) {
  return (t, dt, ctx, state) => {
    state.next ??= 0;
    if (t >= state.next) {
      state.next = t + period;
      fn(ctx, t);
    }
  };
}
function once(at, fn) {
  return (t, dt, ctx, state) => {
    state.done ??= new Set();
    if (t >= at && !state.done.has(at)) {
      state.done.add(at);
      fn(ctx, t);
    }
  };
}

// ── The actions ──────────────────────────────────────────────────────
/*
 * Fields:
 *   label, emoji        shown in the action menu
 *   duration            seconds (ignored when loop)
 *   loop                keeps going until stopped (dance, nap, sit, zombie)
 *   lock                you can't walk while it plays (flip, fall…)
 *   upper               only the upper body: legs keep walking
 *   cancelOnMove        walking stops it
 *   toggle              pressing the key again stops it (zombie)
 *   props               avatar props shown while it plays
 *   pose(t, ctx)        the pose at time t
 *   start(ctx) / tick(t, dt, ctx, state)   effects
 */
export const EMOTES = {
  A: {
    label: 'Applaud', emoji: '👏', duration: 2.4, upper: true,
    start: (c) => bubble(c, '👏'),
    pose: (t) => {
      const apart = (Math.sin(t * TAU * 3.2) + 1) / 2;
      return { ...both([0.035 + apart * 0.09, 0.66, 0.3], [-1, 0, 0.15], 'open'), headRX: 0.06 + 0.04 * Math.sin(t * 6), eyesOpen: 0.55, browY: 0.3 };
    },
  },
  B: {
    label: 'Blush', emoji: '😊', duration: 2.8, upper: true,
    start: (c) => {
      bubble(c, '😊');
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.3, p.z, 3, 0.2);
    },
    pose: (t) => ({
      ...both([0.1, 0.42, -0.2], TO_ME, 'relaxed'), // hands behind the back
      blush: 1, eyesOpen: 0.45, headRX: 0.18, headRZ: 0.22, browTilt: -0.3,
      bodyRZ: 0.06 * Math.sin(t * 5), bodyRY: 0.15 * Math.sin(t * 2.5),
    }),
  },
  C: {
    label: 'Cry', emoji: '😢', duration: 3.2, upper: true,
    start: (c) => bubble(c, '😢'),
    pose: (t) => ({
      ...both([0.09 + 0.015 * Math.sin(t * 10), 0.93, 0.31], [-0.3, 0, -1], 'fist'), // rubbing eyes
      headRX: 0.25, bodyY: 0.012 * Math.sin(t * 14), eyesOpen: 0.15, mouthOpen: 0.25, browTilt: -1, browY: 0.2,
    }),
    tick: every(0.13, (c) => {
      const eye = c.avatar.eyes?.[Math.random() < 0.5 ? 0 : 1];
      if (!eye) return;
      eye.getWorldPosition(tmp);
      c.fx.emoji(tmp, '💧', { vx: (Math.random() - 0.5) * 0.5, vy: 0.4, gravity: 2.5, life: 0.8, size: 0.08 });
    }),
  },
  D: {
    label: 'Dance', emoji: '💃', loop: true, cancelOnMove: true,
    start: (c) => bubble(c, '💃'),
    pose: (t) => {
      const beat = t * TAU * 1.1;
      const s = Math.sin(beat);
      return {
        rigY: Math.abs(s) * 0.07, rigRY: 0.5 * Math.sin(beat / 2),
        bodyRZ: 0.18 * s, headRZ: 0.2 * s,
        ...hands([[-0.3, 1.0 + 0.09 * s, 0.12], [0, 0, 1], 'peace'], [[0.3, 1.0 - 0.09 * s, 0.12], FORWARD, 'peace']),
        legRF: 0.35 * Math.max(0, s), kneeR: 0.05 + 0.5 * Math.max(0, s),
        legLF: 0.35 * Math.max(0, -s), kneeL: 0.05 + 0.5 * Math.max(0, -s),
        eyesOpen: 0.6, browY: 0.3,
      };
    },
    tick: every(0.7, (c) => {
      const p = headPos(c);
      c.fx.emoji(p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2, 0)), Math.random() < 0.5 ? '🎵' : '🎶', { vy: 0.5, life: 1.6, size: 0.14 });
    }),
  },
  E: {
    label: 'Eat with chopsticks', emoji: '🍜', duration: 4.4, upper: true, props: ['chopsticks', 'bowl'],
    start: (c) => bubble(c, '🍜'),
    pose: (t) => {
      const p = (t % 1.3) / 1.3;
      const bite = Math.sin(p * Math.PI) ** 2; // 0 at the bowl, 1 at the mouth
      return {
        ...hands(
          [[lerp(-0.03, -0.04, bite), lerp(0.7, 0.86, bite), lerp(0.32, 0.32, bite)], [0.8, 0.2, -0.3], 'pinch'],
          [[0.07, 0.66, 0.3], UP, 'cup'],
        ),
        mouthOpen: bite > 0.75 ? 0.5 : 0.18 * Math.abs(Math.sin(t * 12)), headRX: 0.12 - 0.12 * bite, eyesOpen: 0.7,
      };
    },
    tick: once(3.6, (c) => bubble(c, '😋', 1.2)),
  },
  F: {
    label: 'Flip', emoji: '🤸', duration: 1.4, lock: true,
    start: (c) => bubble(c, '🤸', 1.2),
    pose: (t) => {
      const u = clamp((t - 0.18) / 1.0); // in the air between 0.18 s and 1.18 s
      const air = Math.sin(Math.PI * u);
      const crouch = pulse(t, 0, 0.12, 0.12, 0.2) + pulse(t, 1.16, 1.24, 1.28, 1.4);
      const leg = 1.4 * air + 0.6 * crouch;
      const knee = 2.0 * air + 1.0 * crouch;
      return {
        rigPivot: 0.6, rigY: 3 * u * (1 - u), rigRX: wrap(-TAU * smooth(u)),
        legRF: leg, legLF: leg, kneeR: knee, kneeL: knee,
        bodyY: -legDrop(leg, knee) * (1 - air), // feet stay on the floor while crouching
        // Arms up for the take-off, then hugging the knees in the air.
        ...both([lerp(0.26, 0.13, air), lerp(1.0, 0.5, air), lerp(0.08, 0.3, air)], [-0.5, 0, -0.5], air > 0.5 ? 'fist' : 'open'),
      };
    },
  },
  G: {
    label: 'Giggle', emoji: '🤭', duration: 2.4, upper: true,
    start: (c) => bubble(c, 'hehe 🤭'),
    pose: (t) => ({
      ...hands([[-0.04, 0.87, 0.32], [0, 0, -1], 'relaxed'], [[0.06, 0.5, 0.24], TO_ME, 'relaxed']), // hand over the mouth
      bodyY: 0.01 * Math.sin(t * 28), bodyRZ: 0.04 * Math.sin(t * 14),
      eyesOpen: 0.3, headRZ: 0.15, headRX: 0.08, blush: 0.4, browY: 0.2,
    }),
  },
  H: {
    label: 'Hug', emoji: '🤗', duration: 2.8, lock: true, needsPartner: true,
    start: (c) => bubble(c, '🤗'),
    pose: hugPose,
    tick: once(0.6, (c) => heartsBetween(c, 6)),
  },
  hugged: {
    label: 'Hugged', emoji: '🥰', duration: 2.8, lock: true, reaction: true,
    start: (c) => bubble(c, '🥰'),
    pose: hugPose,
  },
  heart: {
    label: 'Heart hands', emoji: '💗', duration: 2.4, upper: true,
    start: (c) => bubble(c, '💗'),
    // Fingers curved into the top of a heart, thumbs touching at the bottom.
    pose: (t) => ({ ...both([0.03, 0.82, 0.33], [-0.3, 0, -1], 'heart'), headRZ: 0.15 * Math.sin(t * 3), blush: 0.6, eyesOpen: 0.45, browY: 0.3 }),
    tick: once(0.5, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.2, p.z, 6, 0.25);
    }),
  },
  I: {
    label: 'Ignore', emoji: '💁', duration: 2.8, cancelOnMove: true,
    start: (c) => bubble(c, 'Hmph! 💁'),
    pose: (t, c) => {
      const away = (c.partner ? c.partner.angle : 0) + Math.PI;
      const u = clamp(t / 0.45);
      const overshoot = 1 + 0.15 * Math.sin(Math.PI * u) * (u > 0.6 ? 1 : 0);
      return {
        rigRY: away * smooth(u) * overshoot,
        ...hands([[0.1, 0.6, 0.26], TO_ME, 'relaxed'], [[-0.1, 0.62, 0.24], TO_ME, 'relaxed']), // arms crossed
        headRX: -0.3, headRY: 0.2, eyesOpen: 0.15, browY: 0.5,
      };
    },
  },
  J: {
    label: 'Jump', emoji: '🦘', duration: 0.95,
    pose: (t) => {
      const u = clamp((t - 0.1) / 0.75);
      const air = Math.sin(Math.PI * u);
      const crouch = pulse(t, 0, 0.06, 0.06, 0.12) + pulse(t, 0.82, 0.86, 0.88, 0.95);
      const leg = 0.7 * air + 0.5 * crouch;
      const knee = 1.3 * air + 0.9 * crouch;
      return {
        rigY: 2 * u * (1 - u), legRF: leg, legLF: leg, kneeR: knee, kneeL: knee,
        bodyY: -legDrop(leg, knee) * (1 - air),
        ...both([0.28, 0.4 + 0.62 * air, 0.05 + 0.1 * air], FORWARD, 'open'), browY: 0.5 * air,
      };
    },
    tick: once(0.35, (c) => c.fx.emoji(headPos(c).add(new THREE.Vector3(0, 0.3, 0)), '✨', { vy: 0.3, life: 0.8, size: 0.14 })),
  },
  K: {
    label: 'Kiss', emoji: '😘', duration: 2.2, lock: true, needsPartner: true,
    start: (c) => bubble(c, '😘'),
    pose: kissPose,
    tick: once(1.0, (c) => heartsBetween(c, 8)),
  },
  kissed: {
    label: 'Kissed', emoji: '😳', duration: 2.6, upper: true, reaction: true,
    start: (c) => bubble(c, '😳', 2.2),
    pose: (t) => (t < 1.2 ? kissPose(t) : { ...both([0.2, 0.93, 0.29], [-0.7, 0, -0.7], 'open'), blush: 1, eyesOpen: 0.25, headRZ: -0.2, browY: 0.4 }),
  },
  blowkiss: {
    label: 'Blow a kiss', emoji: '😘', duration: 2.2, upper: true,
    start: (c) => bubble(c, '😘'),
    pose: (t) => {
      const out = ramp(t, 0.6, 1.0);
      return {
        ...hands(
          [[lerp(-0.04, -0.12, out), lerp(0.87, 1.0, out), lerp(0.32, 0.6, out)], [0, lerp(0, 0.6, out), lerp(-1, 0.8, out)], out > 0.5 ? 'open' : 'relaxed'],
          [[0.14, 0.45, 0.05], INWARD, 'relaxed'],
        ),
        pucker: t < 0.9 ? 1 : 0, eyesOpen: 0.4, headRZ: 0.15,
      };
    },
    tick: once(0.85, (c) => {
      const p = headPos(c);
      const yaw = c.facing + (c.partner?.angle ?? 0);
      c.fx.emoji(p, '💋', { vx: Math.sin(yaw) * 1.3, vz: Math.cos(yaw) * 1.3, vy: 0.15, life: 1.6, size: 0.15 });
    }),
  },
  L: {
    label: 'Laugh', emoji: '😂', duration: 3,
    start: (c) => bubble(c, 'Haha 😂'),
    pose: (t) => ({
      bodyRX: -0.18 + 0.03 * Math.sin(t * 20), headRX: -0.3, bodyY: 0.015 * Math.abs(Math.sin(t * 18)),
      mouthOpen: 0.85 + 0.15 * Math.sin(t * 18), eyesOpen: 0.1, browY: 0.5,
      ...both([0.08, 0.5, 0.24], TO_ME, 'relaxed'), // holding the belly
    }),
    tick: every(0.5, (c) => c.fx.emoji(headPos(c), '😂', { vx: (Math.random() - 0.5) * 0.6, vy: 0.6, life: 1.1, size: 0.12 })),
  },
  M: {
    label: 'Meow', emoji: '🐱', duration: 2.6, upper: true, props: ['catEars'],
    start: (c) => bubble(c, 'Meow! 🐱'),
    pose: (t) => ({
      ...hands(
        [[-0.1, 0.86 + 0.05 * Math.sin(t * 9), 0.33], [0, -0.4, 1], 'paw'],
        [[0.1, 0.86 + 0.05 * Math.sin(t * 9 + Math.PI), 0.33], [0, -0.4, 1], 'paw'],
      ),
      headRZ: 0.3, eyesOpen: 0.4, blush: 0.3, browY: 0.3,
    }),
  },
  N: {
    label: 'Nap', emoji: '😴', loop: true, cancelOnMove: true,
    start: (c) => bubble(c, '😴'),
    pose: (t) => {
      const down = ramp(t, 0, 0.9);
      return {
        rigRX: ON_BACK.rigRX * down, rigY: ON_BACK.rigY * down, kneeR: 0.1, kneeL: 0.1,
        ...both([0.07, 0.5, 0.22], TO_ME, 'relaxed'), eyesOpen: 1 - 0.95 * down,
        mouthOpen: 0.12 * (0.5 + 0.5 * Math.sin(t * 1.5)) * down,
      };
    },
    tick: every(1.1, (c, t) => {
      if (t < 1) return;
      c.fx.emoji(headPos(c).add(new THREE.Vector3(0, 0.15, 0)), '💤', { vy: 0.35, vx: 0.1, life: 2, size: 0.16 });
    }),
  },
  O: {
    label: 'Oops', emoji: '🙈', duration: 2.8, lock: true,
    start: (c) => bubble(c, 'Oops! 🙈', 2),
    pose: (t) => {
      const fall = ramp(t, 0.3, 0.7) * (1 - ramp(t, 2.0, 2.8));
      const stumble = pulse(t, 0, 0.15, 0.3, 0.45);
      const flail = 0.08 * Math.sin(t * 30) * stumble;
      return {
        rigRX: (Math.PI / 2) * 0.95 * fall, rigY: 0.23 * fall + 0.04 * stumble, // the big head lands first
        bodyRX: 0.3 * stumble,
        // Arms flail, then land forward on the floor.
        ...both([lerp(0.3, 0.22, fall), lerp(0.95, 1.08, fall) + flail, lerp(0.2, 0.15, fall)], [0, 0, 1], 'open'),
        legRF: -0.3 * fall, legLF: -0.15 * fall + 0.5 * stumble, kneeR: 0.9 * fall, kneeL: 0.6 * fall,
        eyesOpen: 1 - 0.85 * fall, mouthOpen: 0.5 * stumble, browY: 0.8 * stumble,
      };
    },
  },
  P: {
    label: 'Puppy eyes', emoji: '🥺', duration: 2.8, upper: true,
    start: (c) => bubble(c, '🥺'),
    pose: (t) => ({
      eyeScale: 1.45, headRZ: 0.3, headRX: -0.12, browTilt: -0.8, browY: 0.3,
      ...both([0.03, 0.8, 0.32], INWARD, 'relaxed'), // hands together under the chin
      bodyRZ: 0.05 * Math.sin(t * 3), blush: 0.5,
    }),
  },
  Q: {
    label: 'Quack', emoji: '🦆', duration: 2.6, upper: true, props: ['bill'],
    start: (c) => bubble(c, 'Quack! 🦆'),
    pose: (t) => ({
      ...both([0.4, 0.6 + 0.1 * Math.sin(t * 14), -0.05], DOWN, 'open'), // wings
      bodyRZ: 0.12 * Math.sin(t * 6), headRX: 0.1 * Math.sin(t * 12), browY: 0.2,
    }),
  },
  R: {
    label: 'Rainbow', emoji: '🌈', duration: 2.6, upper: true,
    start: (c) => bubble(c, '🌈'),
    pose: (t) => {
      const u = ramp(t, 0.1, 0.55);
      return {
        ...hands(
          [[lerp(-0.3, -0.18, u), lerp(0.45, 1.06, u), lerp(-0.1, 0.33, u)], [0, 0, lerp(-1, 1, u)], t < 0.5 ? 'fist' : 'open'],
          [[0.2, 0.42, 0.05], INWARD, 'relaxed'],
        ),
        headRX: -0.35 * ramp(t, 0.4, 0.8), eyesOpen: 0.7, browY: 0.4,
      };
    },
    tick: once(0.5, (c) => {
      const p = c.position.clone();
      p.x += Math.sin(c.facing) * 0.7;
      p.z += Math.cos(c.facing) * 0.7;
      p.y = 1.3;
      c.fx.rainbow(p, c.facing);
    }),
  },
  S: {
    label: 'Sit', emoji: '🪑', loop: true, needsBench: true,
    // Hips on the seat (0.5 m), thighs forward, shins hanging down.
    pose: () => ({ rigY: 0.14, legRF: 1.45, legLF: 1.45, kneeR: 1.45, kneeL: 1.45, ...both([0.12, 0.49, 0.26], DOWN, 'relaxed'), bodyRX: -0.04 }),
  },
  T: {
    label: 'Tickle', emoji: '😈', duration: 2.4, lock: true, needsPartner: true,
    start: (c) => bubble(c, '😈'),
    pose: (t, c) => ({
      rigRY: c.partner?.angle ?? 0, rigZ: 0.15 * ramp(t, 0, 0.3), bodyRX: 0.2,
      ...hands(
        [[-0.13 + 0.05 * Math.sin(t * 25), 0.62, 0.55], [0, -0.3, 1], wiggle(t)],
        [[0.13 + 0.05 * Math.sin(t * 25 + 1.5), 0.62, 0.55], [0, -0.3, 1], wiggle(t + 0.3)],
      ),
      eyesOpen: 0.5, mouthOpen: 0.3, browY: 0.3,
    }),
  },
  tickleair: {
    label: 'Tickle', emoji: '🤏', duration: 1.6, upper: true,
    start: (c) => bubble(c, '🤏'),
    pose: (t) => ({
      ...hands([[-0.15, 0.75, 0.42], FORWARD, wiggle(t)], [[0.15, 0.75, 0.42], FORWARD, wiggle(t + 0.3)]),
      eyesOpen: 0.5, browY: 0.3,
    }),
  },
  tickled: {
    label: 'Tickled', emoji: '😂', duration: 3.4, lock: true, reaction: true,
    start: (c) => bubble(c, 'Hahaha 😂', 2.6),
    pose: (t) => {
      const down = ramp(t, 0.4, 0.9) * (1 - ramp(t, 2.8, 3.4));
      return {
        rigRX: ON_BACK.rigRX * down, rigY: ON_BACK.rigY * down, bodyRX: -0.1 * (1 - down),
        legRF: (0.95 + 0.45 * Math.sin(t * 16)) * down, legLF: (0.95 + 0.45 * Math.sin(t * 16 + Math.PI)) * down, // kicking in the air
        kneeR: (0.8 + 0.6 * Math.sin(t * 16 + 1)) * down, kneeL: (0.8 + 0.6 * Math.sin(t * 16 + 4)) * down,
        ...hands([[-0.1 + 0.08 * Math.sin(t * 20), 0.55, 0.25], TO_ME, 'relaxed'], [[0.1 + 0.08 * Math.sin(t * 20 + 2), 0.55, 0.25], TO_ME, 'relaxed']),
        mouthOpen: 0.9, eyesOpen: 0.1, bodyY: 0.012 * Math.sin(t * 22), browY: 0.5,
      };
    },
    tick: every(0.35, (c) => c.fx.emoji(headPos(c), '😂', { vx: (Math.random() - 0.5) * 0.7, vy: 0.6, life: 1, size: 0.12 })),
  },
  U: {
    label: 'Uh-oh!', emoji: '🤩', duration: 2.4, cancelOnMove: true,
    start: (c) => bubble(c, 'Uh-oh! 🤩'),
    pose: (t) => ({
      rigY: 0.08 * Math.abs(Math.sin(t * 11)), ...both([0.2, 0.93, 0.29], [-0.7, 0, -0.7], 'open'), // hands on cheeks
      eyeScale: 1.3, mouthOpen: 0.55, bodyRZ: 0.08 * Math.sin(t * 11), browY: 1,
    }),
  },
  V: {
    label: 'Victory', emoji: '✌️', duration: 2.2, upper: true,
    start: (c) => bubble(c, '✌️'),
    pose: () => ({
      ...hands([[-0.3, 1.06, 0.18], [0, 0, 1], 'peace'], [[0.32, 0.47, 0.04], INWARD, 'fist']), // ✌️ up, other hand on the hip
      wink: 1, headRZ: -0.25, blush: 0.3, browY: 0.3,
    }),
  },
  W: {
    label: 'Wave', emoji: '👋', duration: 2.2, upper: true,
    start: (c) => bubble(c, '👋'),
    pose: (t) => ({ ...hand('R', [-0.33 + 0.06 * Math.sin(t * 9), 1.05, 0.14], [0.35 * Math.sin(t * 9), 0, 1], 'open'), headRZ: 0.15, eyesOpen: 0.7, browY: 0.3 }),
  },
  X: {
    label: 'Nope', emoji: '❌', duration: 2.4, upper: true,
    start: (c) => bubble(c, 'Nope! ❌'),
    pose: (t) => ({
      ...hands([[0.12, 0.85, 0.32], FORWARD, 'open'], [[-0.12, 0.85, 0.32], FORWARD, 'open']), // arms crossed in an X, palms out
      headRY: 0.35 * Math.sin(t * 12) * (1 - ramp(t, 0.8, 1.6)), eyesOpen: 0.65, browTilt: 0.7,
    }),
  },
  Y: {
    label: 'Yawn', emoji: '🥱', duration: 3, upper: true,
    start: (c) => bubble(c, '🥱'),
    pose: (t) => {
      const stretch = pulse(t, 0.3, 0.9, 2.0, 2.6);
      return {
        ...both([0.15, 0.45 + 0.68 * stretch, -0.05], UP, 'open'),
        headRX: -0.3 * stretch, mouthOpen: pulse(t, 0.2, 0.8, 1.8, 2.5), eyesOpen: 1 - 0.9 * stretch,
        bodyRX: -0.08 * stretch, browY: 0.5 * stretch,
      };
    },
  },
  Z: {
    label: 'Zombie walk', emoji: '🧟', loop: true, toggle: true, upper: true, walkStyle: 'zombie',
    start: (c) => bubble(c, '🧟'),
    pose: (t) => ({
      ...hands(
        [[-0.15, 0.75 + 0.04 * Math.sin(t * 3), 0.6], [0, -1, 0.2], 'claw'],
        [[0.15, 0.75 + 0.04 * Math.sin(t * 3 + 1), 0.6], [0, -1, 0.2], 'claw'],
      ),
      headRZ: 0.35, headRX: 0.15, eyesOpen: 0.5, mouthOpen: 0.35, browTilt: -0.5,
    }),
  },
};
for (const [id, def] of Object.entries(EMOTES)) def.id = id;

/** The 26 keys in the action menu (A … Z). */
export const MENU = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Who reacts how when an action targets them. */
export const REACTIONS = { H: 'hugged', T: 'tickled', K: 'kissed' };

function hugPose(t) {
  const inn = ramp(t, 0, 0.4);
  return {
    rigZ: 0.22 * inn, bodyRX: 0.12 * inn,
    ...hands([[0.06, 0.72, 0.52], TO_ME, 'relaxed'], [[-0.06, 0.7, 0.5], TO_ME, 'relaxed']), // arms around the other person
    headRZ: 0.25, eyesOpen: 0.2, blush: 0.6, browTilt: -0.2,
  };
}

function kissPose(t) {
  const inn = ramp(t, 0, 0.5);
  return {
    rigZ: 0.18 * inn, bodyRX: 0.2 * inn, headRZ: 0.3 * inn,
    pucker: t > 0.3 ? 1 : 0, eyesOpen: 0.1, ...both([0.1, 0.45, -0.2], TO_ME, 'relaxed'), blush: 0.5, browY: 0.2,
  };
}

function heartsBetween(ctx, n) {
  if (!ctx.partner) return;
  const p = ctx.position.clone().lerp(ctx.partner.position, 0.5);
  ctx.hearts?.burst(p.x, 1.4, p.z, n, 0.2);
}

/**
 * Plays one action at a time on one avatar, fading in and out.
 * update() returns what avatar.update() needs: { def, pose, weight }.
 */
export class EmotePlayer {
  constructor() {
    this.current = null;
    this.weight = 0;
    this.onEnd = () => {};
  }

  get id() {
    return this.current && !this.current.stopping ? this.current.def.id : '';
  }

  /** True while an action that forbids walking is playing. */
  get locked() {
    return Boolean(this.current?.def.lock && !this.current.stopping);
  }

  get active() {
    return Boolean(this.current && !this.current.stopping);
  }

  /** Start an action. Returns false for unknown ids. Toggles stop a running toggle. */
  play(id, { target = null } = {}) {
    const def = EMOTES[id];
    if (!def) return false;
    if (def.toggle && this.current?.def.id === id && !this.current.stopping) {
      this.stop();
      return true;
    }
    this.current = { def, t: 0, target, started: false, state: {} };
    return true;
  }

  stop() {
    if (this.current) this.current.stopping = true;
  }

  /**
   * @param ctx    { avatar, fx, hearts, position, facing, partner: { angle, position } | null }
   * @param moving true while this avatar is walking
   */
  update(dt, ctx, moving) {
    const c = this.current;
    if (!c) return null;
    c.t += dt;
    if (!c.started) {
      c.started = true;
      c.def.start?.(ctx);
    }
    if (!c.stopping && ((moving && c.def.cancelOnMove) || (!c.def.loop && c.t >= c.def.duration))) c.stopping = true;
    const goal = c.stopping ? 0 : 1;
    this.weight += (goal - this.weight) * Math.min(1, dt * (c.stopping ? 6 : 10));
    if (c.stopping && this.weight < 0.02) {
      this.weight = 0;
      this.current = null;
      this.onEnd(c.def.id);
      return null;
    }
    if (!c.stopping) c.def.tick?.(c.t, dt, ctx, c.state);
    // After a one-shot action ends, hold its last pose while it fades out (no rewinding).
    const t = c.def.loop ? c.t : Math.min(c.t, c.def.duration);
    return { def: c.def, pose: c.def.pose(t, ctx) ?? {}, weight: this.weight };
  }
}
