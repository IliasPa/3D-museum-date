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
import { restPose } from './avatar.js';
import { COUPLE_EMOTES, COUPLE_REACTIONS, SEAT } from './coupleEmotes.js';
import {
  clamp, smooth, ramp, pulse, lerp, wrap, TAU, legDrop, ON_BACK, wiggle, hand, hands, both,
  FORWARD, TO_ME, DOWN, UP, INWARD, tmp, bubble, headPos, every, once,
} from './poseKit.js';

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
    pose: (t) => {
      const apart = (Math.sin(t * TAU * 3.2) + 1) / 2;
      return { ...both([0.035 + apart * 0.09, 0.66, 0.3], [-1, 0, 0.15], 'open'), headRX: 0.06 + 0.04 * Math.sin(t * 6), eyesOpen: 0.55, browY: 0.3 };
    },
  },
  B: {
    label: 'Blush', emoji: '😊', duration: 2.8, upper: true,
    start: (c) => {
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
  },
  E: {
    label: 'Eat with chopsticks', emoji: '🍜', duration: 4.4, upper: true, props: ['chopsticks', 'bowl'],
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
  },
  F: {
    label: 'Flip', emoji: '🤸', duration: 1.4, lock: true,
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
    pose: hugPose,
    tick: once(0.6, (c) => heartsBetween(c, 6)),
  },
  hugged: {
    label: 'Hugged', emoji: '🥰', duration: 2.8, lock: true, reaction: true,
    pose: hugPose,
  },
  heart: {
    label: 'Heart hands', emoji: '💗', duration: 2.8, upper: true, props: ['heart'],
    // Palms facing each other under the chin, fingers curled over into the two
    // round tops of a heart, thumbs turned down to its tip — with a little
    // glowing heart beating between them.
    pose: (t) => ({
      ...both([0.085, 0.77, 0.3], [-1, 0, -0.3], 'heart', [-0.35, 1, 0.05]),
      headRZ: 0.12 * Math.sin(t * 3), headRX: 0.08, blush: 0.6, eyesOpen: 0.45, browY: 0.3,
    }),
    tick: (t, dt, c, state) => {
      const beat = Math.max(0, Math.sin(t * 7));
      c.avatar.props?.heart?.scale.setScalar(0.85 + 0.25 * beat * beat);
      if (t > 0.6 && !state.burst) {
        state.burst = true; // a few hearts float up out of the hands
        const p = c.avatar.props?.heart?.getWorldPosition(new THREE.Vector3()) ?? headPos(c);
        c.hearts?.burst(p.x, p.y + 0.1, p.z, 4, 0.15);
      }
    },
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
  },
  K: {
    label: 'Kiss', emoji: '😘', duration: 2.2, lock: true, needsPartner: true,
    pose: kissPose,
    tick: once(1.0, (c) => heartsBetween(c, 8)),
  },
  kissed: {
    label: 'Kissed', emoji: '😳', duration: 2.6, upper: true, reaction: true,
    pose: (t) => (t < 1.2 ? kissPose(t) : { ...both([0.2, 0.93, 0.29], [-0.7, 0, -0.7], 'open'), blush: 1, eyesOpen: 0.25, headRZ: -0.2, browY: 0.4 }),
  },
  blowkiss: {
    label: 'Blow a kiss', emoji: '😘', duration: 2.2, upper: true,
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
    pose: (t) => {
      const down = ramp(t, 0, 0.9);
      return {
        rigRX: ON_BACK.rigRX * down, rigY: ON_BACK.rigY * down, kneeR: 0.1, kneeL: 0.1,
        ...both([0.07, 0.5, 0.22], TO_ME, 'relaxed'), eyesOpen: 1 - 0.95 * down,
        mouthOpen: 0.12 * (0.5 + 0.5 * Math.sin(t * 1.5)) * down,
      };
    },
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
    label: 'Rainbow', emoji: '🌈', duration: 2.8, upper: true,
    // Gather both hands low at one side, then throw them up and apart — the
    // rainbow springs out of them, arching over your head.
    pose: (t) => {
      const wind = pulse(t, 0, 0.28, 0.32, 0.45);
      const up = ramp(t, 0.32, 0.55) * (1 - ramp(t, 2.25, 2.8));
      const low = (x) => [x - 0.08 * wind, 0.4 + 0.04 * wind, 0.22];
      const high = (x) => [x * 2.9, 1.02, 0.2];
      const at = (x) => low(x).map((v, k) => lerp(v, high(x)[k], up));
      return {
        ...hands(
          [at(-0.12), [0, lerp(-0.4, 0.5, up), 1], up > 0.4 ? 'open' : 'fist', up > 0.4 ? [-0.5, 1, 0.2] : null],
          [at(0.12), [0, lerp(-0.4, 0.5, up), 1], up > 0.4 ? 'open' : 'fist', up > 0.4 ? [0.5, 1, 0.2] : null],
        ),
        bodyRX: 0.14 * wind - 0.08 * up, bodyRY: -0.3 * wind, headRX: -0.32 * up, headRY: -0.2 * wind,
        eyesOpen: 1, eyeScale: 1 + 0.15 * up, mouthOpen: 0.35 * up, browY: 0.6 * up,
      };
    },
    tick: once(0.42, (c) => {
      const p = c.position.clone();
      p.x += Math.sin(c.facing) * 0.2;
      p.z += Math.cos(c.facing) * 0.2;
      p.y += 1.02; // from the hands
      c.fx.rainbow(p, c.facing);
    }),
  },
  S: {
    label: 'Sit', emoji: '🪑', loop: true, needsBench: true, seated: true,
    // Hips on the seat (0.5 m), thighs forward, shins hanging down.
    pose: () => ({ ...SEAT, ...both([0.12, 0.49, 0.26], DOWN, 'relaxed') }),
  },
  T: {
    label: 'Tickle', emoji: '😈', duration: 2.4, lock: true, needsPartner: true,
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
    pose: () => ({
      ...hands([[-0.3, 1.06, 0.18], [0, 0, 1], 'peace'], [[0.32, 0.47, 0.04], INWARD, 'fist']), // ✌️ up, other hand on the hip
      wink: 1, headRZ: -0.25, blush: 0.3, browY: 0.3,
    }),
  },
  W: {
    label: 'Wave', emoji: '👋', duration: 2.2, upper: true,
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
    pose: (t) => ({
      ...hands(
        [[-0.15, 0.75 + 0.04 * Math.sin(t * 3), 0.6], [0, -1, 0.2], 'claw'],
        [[0.15, 0.75 + 0.04 * Math.sin(t * 3 + 1), 0.6], [0, -1, 0.2], 'claw'],
      ),
      headRZ: 0.35, headRX: 0.15, eyesOpen: 0.5, mouthOpen: 0.35, browTilt: -0.5,
    }),
  },
};
Object.assign(EMOTES, COUPLE_EMOTES); // twirl & dance, the bench actions, the proposal (coupleEmotes.js)
for (const [id, def] of Object.entries(EMOTES)) def.id = id;

/** The 26 keys in the action menu (A … Z). */
export const MENU = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Who reacts how when an action targets them. */
export const REACTIONS = { H: 'hugged', T: 'tickled', K: 'kissed', ...COUPLE_REACTIONS };

export { BENCH_MENU } from './coupleEmotes.js';

const BLEND = 0.3; // seconds to glide from one action into the next

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
    this.lastPose = null;
    this.onEnd = () => {};
    this.next = () => null; // (def) => id of an action to go straight into when `def` ends (e.g. back to sitting)
    this.onChain = () => {}; // (id) — it went straight into that one
  }

  /** Seconds since the current action started (0 if none). */
  get time() {
    return this.current && !this.current.stopping ? this.current.t : 0;
  }

  /** Who the current action is aimed at (a uid), if anyone. */
  get target() {
    return this.current && !this.current.stopping ? this.current.target : null;
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
    // Glide from wherever the last action left the body (no sudden jumps between actions).
    const from = this.current && this.weight > 0.05 && this.lastPose ? this.lastPose : null;
    this.current = { def, t: 0, target, started: false, state: {}, from };
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
    if (!c.stopping && !c.def.loop && c.t >= c.def.duration) {
      // Some actions flow straight into another (a bench action back into sitting).
      const next = this.next(c.def);
      if (next && EMOTES[next]) {
        this.play(next, { target: null });
        this.onChain(next);
        return this.update(0, ctx, moving);
      }
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
    let pose = c.def.pose(t, ctx) ?? {};
    if (c.from) {
      const k = smooth(clamp(c.t / BLEND));
      if (k < 1) pose = mixPoses(c.from, pose, k);
      else c.from = null;
    }
    this.lastPose = pose;
    const props = typeof c.def.props === 'function' ? c.def.props(t, ctx) : c.def.props;
    return { def: c.def, pose, weight: this.weight, t, props };
  }
}

/** A pose part-way between two poses (values missing from one come from the resting pose). */
const REST = restPose();
function mixPoses(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[key] = lerp(a[key] ?? REST[key] ?? 0, b[key] ?? REST[key] ?? 0, k);
  }
  return out;
}
