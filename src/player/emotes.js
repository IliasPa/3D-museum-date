/**
 * Actions ("emotes"): A = Applaud … Z = Zombie walk, plus the reactions
 * (being hugged, tickled or kissed).
 *
 * Each action describes, over time t (seconds), a pose for the avatar (see
 * restPose() in avatar.js) and optionally some effects (bubbles, tears, 💤…).
 * EmotePlayer plays one action at a time, blending it in and out smoothly.
 * The same code animates your avatar and the other person's, so both
 * screens show the same thing.
 */
import * as THREE from 'three';

// ── Little animation helpers ─────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 between times a and b (eased). */
const ramp = (t, a, b) => smooth(clamp((t - a) / (b - a)));
/** Up between a→b, down between c→d. */
const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const TAU = Math.PI * 2;

// Shoulders in body space (see avatar.js), right = −x.
const SHOULDER = { R: [-0.245, 0.72, 0], L: [0.245, 0.72, 0] };

/**
 * Point an arm so the hand goes towards (x, y, z) in body space
 * (feet at 0, head ≈ 1.0 high, face towards +z). Returns pose values.
 */
function aim(side, x, y, z) {
  const [sx, sy, sz] = SHOULDER[side];
  let dx = x - sx;
  let dy = y - sy;
  let dz = z - sz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  const a = Math.asin(clamp(dx, -1, 1));
  const F = Math.atan2(dz, -dy);
  return side === 'R' ? { armRF: F, armRS: -a - 0.18 } : { armLF: F, armLS: a - 0.18 };
}
const hands = (r, l) => ({ ...aim('R', ...r), ...aim('L', ...l) });
/** Same point for both hands, mirrored in x. */
const both = (x, y, z) => hands([-x, y, z], [x, y, z]);

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
function chain(...fns) {
  return (t, dt, ctx, state) => fns.forEach((f) => f(t, dt, ctx, state));
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
      return { ...both(0.035 + apart * 0.12, 0.68, 0.26), headRX: 0.06 + 0.04 * Math.sin(t * 6), eyesOpen: 0.55 };
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
      ...both(0.12, 0.45, -0.25), // hands behind the back
      blush: 1, eyesOpen: 0.45, headRX: 0.18, headRZ: 0.22,
      bodyRZ: 0.06 * Math.sin(t * 5), bodyRY: 0.15 * Math.sin(t * 2.5),
    }),
  },
  C: {
    label: 'Cry', emoji: '😢', duration: 3.2, upper: true,
    start: (c) => bubble(c, '😢'),
    pose: (t) => ({
      ...both(0.1 + 0.02 * Math.sin(t * 10), 0.98, 0.33), // rubbing eyes
      headRX: 0.25, bodyY: 0.012 * Math.sin(t * 14), eyesOpen: 0.15, mouthOpen: 0.25,
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
        armRF: 2.5 + 0.5 * s, armLF: 2.5 - 0.5 * s, armRS: 0.3, armLS: 0.3,
        legRF: 0.35 * Math.max(0, s), legLF: 0.35 * Math.max(0, -s), eyesOpen: 0.6,
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
        ...hands([-0.02 - 0.02 * bite, 0.72 + 0.18 * bite, 0.33], [0.05, 0.7, 0.32]),
        mouthOpen: bite > 0.75 ? 0.5 : 0.18 * Math.abs(Math.sin(t * 12)), headRX: 0.12, eyesOpen: 0.7,
      };
    },
    tick: once(3.6, (c) => bubble(c, '😋', 1.2)),
  },
  F: {
    label: 'Flip', emoji: '🤸', duration: 1.35, lock: true,
    start: (c) => bubble(c, '🤸', 1.2),
    pose: (t) => {
      const u = clamp((t - 0.15) / 1.0);
      const air = Math.sin(Math.PI * u);
      return {
        rigPivot: 0.6, rigY: 3 * u * (1 - u), rigRX: -TAU * smooth(u),
        legRF: 1.3 * air, legLF: 1.3 * air,
        armRF: 2.8 * (1 - air) + 1.2 * air, armLF: 2.8 * (1 - air) + 1.2 * air,
        bodyY: -0.06 * (pulse(t, 0, 0.12, 0.12, 0.2) + pulse(t, 1.12, 1.2, 1.25, 1.35)),
      };
    },
  },
  G: {
    label: 'Giggle', emoji: '🤭', duration: 2.4, upper: true,
    start: (c) => bubble(c, 'hehe 🤭'),
    pose: (t) => ({
      ...hands([-0.02, 0.9, 0.34], [0.08, 0.52, 0.22]), // hand over the mouth
      bodyY: 0.01 * Math.sin(t * 28), bodyRZ: 0.04 * Math.sin(t * 14),
      eyesOpen: 0.3, headRZ: 0.15, headRX: 0.08, blush: 0.4,
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
    pose: (t) => ({ ...both(0.03, 0.8, 0.34), headRZ: 0.15 * Math.sin(t * 3), blush: 0.6, eyesOpen: 0.45 }), // hands make a heart in front
    tick: once(0.5, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.5, p.z, 6, 0.25);
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
        ...hands([0.12, 0.6, 0.24], [-0.12, 0.62, 0.24]), // arms crossed
        headRX: -0.3, headRY: 0.2, eyesOpen: 0.15,
      };
    },
  },
  J: {
    label: 'Jump', emoji: '🦘', duration: 0.9,
    pose: (t) => {
      const u = clamp((t - 0.08) / 0.75);
      const air = Math.sin(Math.PI * u);
      return { rigY: 2 * u * (1 - u), legRF: 0.6 * air, legLF: 0.6 * air, armRF: 2.6 * air, armLF: 2.6 * air, armRS: 0.3 * air, armLS: 0.3 * air };
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
    pose: (t) => (t < 1.2 ? kissPose(t) : { ...both(0.2, 0.93, 0.27), blush: 1, eyesOpen: 0.25, headRZ: -0.2 }),
  },
  blowkiss: {
    label: 'Blow a kiss', emoji: '😘', duration: 2.2, upper: true,
    start: (c) => bubble(c, '😘'),
    pose: (t) => {
      const out = ramp(t, 0.6, 1.0);
      return {
        ...hands([-0.02 - 0.1 * out, 0.9 + 0.15 * out, 0.33 + 0.4 * out], [0.12, 0.45, 0.05]),
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
      mouthOpen: 0.85 + 0.15 * Math.sin(t * 18), eyesOpen: 0.1, ...both(0.08, 0.5, 0.24),
    }),
    tick: every(0.5, (c) => c.fx.emoji(headPos(c), '😂', { vx: (Math.random() - 0.5) * 0.6, vy: 0.6, life: 1.1, size: 0.12 })),
  },
  M: {
    label: 'Meow', emoji: '🐱', duration: 2.6, upper: true, props: ['catEars'],
    start: (c) => bubble(c, 'Meow! 🐱'),
    pose: (t) => ({
      ...hands([-0.1, 0.92 + 0.05 * Math.sin(t * 9), 0.36], [0.1, 0.92 + 0.05 * Math.sin(t * 9 + Math.PI), 0.36]),
      headRZ: 0.3, eyesOpen: 0.4, blush: 0.3,
    }),
  },
  N: {
    label: 'Nap', emoji: '😴', loop: true, cancelOnMove: true,
    start: (c) => bubble(c, '😴'),
    pose: (t) => {
      const down = ramp(t, 0, 0.9);
      return {
        rigRX: (-Math.PI / 2) * down, rigY: 0.21 * down,
        ...both(0.06, 0.5, 0.22), eyesOpen: 1 - 0.95 * down, mouthOpen: 0.12 * (0.5 + 0.5 * Math.sin(t * 1.5)) * down,
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
      return {
        rigRX: (Math.PI / 2) * 0.95 * fall, rigY: 0.17 * fall,
        bodyRX: 0.3 * stumble, armRF: 2.5 * stumble + 2.9 * fall + 0.4 * Math.sin(t * 30) * stumble, armLF: 2.4 * stumble + 2.9 * fall,
        legRF: -0.4 * fall, legLF: -0.2 * fall + 0.5 * stumble, eyesOpen: 1 - 0.85 * fall, mouthOpen: 0.5 * stumble,
      };
    },
  },
  P: {
    label: 'Puppy eyes', emoji: '🥺', duration: 2.8, upper: true,
    start: (c) => bubble(c, '🥺'),
    pose: (t) => ({
      eyeScale: 1.45, headRZ: 0.3, headRX: -0.12, ...both(0.02, 0.8, 0.33),
      bodyRZ: 0.05 * Math.sin(t * 3), blush: 0.5,
    }),
  },
  Q: {
    label: 'Quack', emoji: '🦆', duration: 2.6, upper: true, props: ['bill'],
    start: (c) => bubble(c, 'Quack! 🦆'),
    pose: (t) => {
      const flap = 0.55 + 0.35 * Math.sin(t * 14);
      return { armRS: flap, armLS: flap, armRF: -0.25, armLF: -0.25, bodyRZ: 0.12 * Math.sin(t * 6), headRX: 0.1 * Math.sin(t * 12) };
    },
  },
  R: {
    label: 'Rainbow', emoji: '🌈', duration: 2.6, upper: true,
    start: (c) => bubble(c, '🌈'),
    pose: (t) => {
      const u = ramp(t, 0.1, 0.55);
      return {
        ...hands([-0.3 + 0.1 * u, 0.4 + 1.1 * u, -0.1 + 0.6 * u], [0.2, 0.4, 0.05]),
        headRX: -0.35 * ramp(t, 0.4, 0.8), eyesOpen: 0.7,
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
    pose: () => ({ rigY: 0.16, legRF: 1.45, legLF: 1.45, ...both(0.12, 0.5, 0.3), bodyRX: -0.04 }),
  },
  T: {
    label: 'Tickle', emoji: '😈', duration: 2.4, lock: true, needsPartner: true,
    start: (c) => bubble(c, '😈'),
    pose: (t, c) => ({
      rigRY: c.partner?.angle ?? 0, rigZ: 0.15 * ramp(t, 0, 0.3), bodyRX: 0.2,
      ...hands([-0.15 + 0.06 * Math.sin(t * 25), 0.65, 0.6], [0.15 + 0.06 * Math.sin(t * 25 + 1.5), 0.65, 0.6]),
      eyesOpen: 0.5, mouthOpen: 0.3,
    }),
  },
  tickleair: {
    label: 'Tickle', emoji: '🤏', duration: 1.6, upper: true,
    start: (c) => bubble(c, '🤏'),
    pose: (t) => ({ ...hands([-0.15 + 0.06 * Math.sin(t * 25), 0.75, 0.5], [0.15 + 0.06 * Math.sin(t * 25 + 1.5), 0.75, 0.5]), eyesOpen: 0.5 }),
  },
  tickled: {
    label: 'Tickled', emoji: '😂', duration: 3.4, lock: true, reaction: true,
    start: (c) => bubble(c, 'Hahaha 😂', 2.6),
    pose: (t) => {
      const down = ramp(t, 0.4, 0.9) * (1 - ramp(t, 2.8, 3.4));
      return {
        rigRX: (-Math.PI / 2) * down, rigY: 0.21 * down, bodyRX: -0.1 * (1 - down),
        legRF: (0.6 + 0.5 * Math.sin(t * 16)) * down, legLF: (0.6 + 0.5 * Math.sin(t * 16 + Math.PI)) * down,
        ...hands([-0.1 + 0.08 * Math.sin(t * 20), 0.55, 0.25], [0.1 + 0.08 * Math.sin(t * 20 + 2), 0.55, 0.25]),
        mouthOpen: 0.9, eyesOpen: 0.1, bodyY: 0.012 * Math.sin(t * 22),
      };
    },
    tick: every(0.35, (c) => c.fx.emoji(headPos(c), '😂', { vx: (Math.random() - 0.5) * 0.7, vy: 0.6, life: 1, size: 0.12 })),
  },
  U: {
    label: 'Uh-oh!', emoji: '🤩', duration: 2.4, cancelOnMove: true,
    start: (c) => bubble(c, 'Uh-oh! 🤩'),
    pose: (t) => ({
      rigY: 0.08 * Math.abs(Math.sin(t * 11)), ...both(0.19, 0.92, 0.27), // hands on cheeks
      eyeScale: 1.3, mouthOpen: 0.55, bodyRZ: 0.08 * Math.sin(t * 11),
    }),
  },
  V: {
    label: 'Victory', emoji: '✌️', duration: 2.2, upper: true,
    start: (c) => bubble(c, '✌️'),
    pose: () => ({ ...hands([-0.35, 1.45, 0.15], [0.36, 0.47, 0.05]), wink: 1, headRZ: -0.25, blush: 0.3 }),
  },
  W: {
    label: 'Wave', emoji: '👋', duration: 2.2, upper: true,
    start: (c) => bubble(c, '👋'),
    pose: (t) => ({ ...aim('R', -0.45 + 0.12 * Math.sin(t * 9), 1.35, 0.1), headRZ: 0.15, eyesOpen: 0.7 }),
  },
  X: {
    label: 'Nope', emoji: '❌', duration: 2.4, upper: true,
    start: (c) => bubble(c, 'Nope! ❌'),
    pose: (t) => ({ ...hands([0.15, 0.85, 0.3], [-0.15, 0.85, 0.3]), headRY: 0.35 * Math.sin(t * 12) * (1 - ramp(t, 0.8, 1.6)), eyesOpen: 0.65 }),
  },
  Y: {
    label: 'Yawn', emoji: '🥱', duration: 3, upper: true,
    start: (c) => bubble(c, '🥱'),
    pose: (t) => {
      const stretch = pulse(t, 0.3, 0.9, 2.0, 2.6);
      return {
        ...hands([-0.25, 0.45 + 1.05 * stretch, -0.05], [0.25, 0.45 + 1.05 * stretch, -0.05]),
        headRX: -0.3 * stretch, mouthOpen: pulse(t, 0.2, 0.8, 1.8, 2.5), eyesOpen: 1 - 0.9 * stretch, bodyRX: -0.08 * stretch,
      };
    },
  },
  Z: {
    label: 'Zombie walk', emoji: '🧟', loop: true, toggle: true, upper: true, walkStyle: 'zombie',
    start: (c) => bubble(c, '🧟'),
    pose: (t) => ({
      ...hands([-0.15, 0.75 + 0.04 * Math.sin(t * 3), 0.6], [0.15, 0.75 + 0.04 * Math.sin(t * 3 + 1), 0.6]),
      headRZ: 0.35, headRX: 0.15, eyesOpen: 0.5, mouthOpen: 0.35,
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
    ...hands([0.05, 0.7, 0.62], [-0.05, 0.7, 0.62]), // arms around the other person
    headRZ: 0.25, eyesOpen: 0.2, blush: 0.6,
  };
}

function kissPose(t) {
  const inn = ramp(t, 0, 0.5);
  return {
    rigZ: 0.18 * inn, bodyRX: 0.2 * inn, headRZ: 0.3 * inn,
    pucker: t > 0.3 ? 1 : 0, eyesOpen: 0.1, ...both(0.1, 0.45, -0.22), blush: 0.5,
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
    return { def: c.def, pose: c.def.pose(c.t, ctx) ?? {}, weight: this.weight };
  }
}
