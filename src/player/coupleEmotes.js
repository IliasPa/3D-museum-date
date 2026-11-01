/**
 * Actions for two: twirling and dancing together (D), everything you can do
 * sitting on a bench (A–Z while seated), and the proposal (kneeling with a
 * ring, the answer, fireworks).
 *
 * A "pair" action is aimed at the other person; their screen plays the
 * matching reaction (COUPLE_REACTIONS) and sends it back, so both screens
 * show both halves. Reactions have their own ids, so they never trigger
 * another reaction.
 *
 * Extra fields (see emotes.js for the usual ones):
 *   seated    played sitting on a bench (legs stay seated; ends back in "S")
 *   pair      needs the other person sitting next to you (else a solo version)
 *   scoot     both slide closer together on the bench first
 *   follows   [ids] — a reaction that ends when the other person stops doing one of these
 *   selfie / quiet    the game takes a photo / slows everything down while it plays
 *   props(t, ctx)     which props show (may change over time)
 */
import {
  clamp, smooth, ramp, pulse, lerp, wrap, TAU, wiggle, hand, hands, both,
  FORWARD, TO_ME, DOWN, UP, INWARD, tmp, bubble, headPos, every, once,
} from './poseKit.js';

// ── Sitting ──────────────────────────────────────────────────────────
/** Hips on the seat (0.5 m), thighs forward, shins hanging down. */
export const SEAT = { rigY: 0.14, legRF: 1.45, legLF: 1.45, kneeR: 1.45, kneeL: 1.45, bodyRX: -0.04 };
const LAP = both([0.12, 0.49, 0.26], DOWN, 'relaxed');
const seated = (pose) => ({ ...SEAT, ...LAP, ...pose });

/** Which side the other person is on: +1 = my left (+x), −1 = my right. Alone: +1. */
const sideOf = (c) => (c.partner ? Math.sign(c.partner.angle) || 1 : 1);
/** The other person, if they're right next to me (sitting beside me). */
const besideMe = (c) => Boolean(c.partner) && Math.hypot(c.partner.position.x - c.position.x, c.partner.position.z - c.position.z) < 1.4;
/** The hand on the other person's side, and the other one. */
const nearHand = (s) => (s > 0 ? 'L' : 'R');
const farHand = (s) => (s > 0 ? 'R' : 'L');
const CHEEKS = [[0.2, 0.93, 0.29], [-0.7, 0, -0.7], 'open']; // both hands on the cheeks (left hand; `both` mirrors)
const cheeks = (k) => both([lerp(0.12, CHEEKS[0][0], k), lerp(0.49, CHEEKS[0][1], k), lerp(0.26, CHEEKS[0][2], k)], k > 0.5 ? CHEEKS[1] : DOWN, k > 0.5 ? 'open' : 'relaxed');

/** A burst of hearts between the two of you (or above me). */
function heartsBetween(c, n, height = 1.25) {
  const p = c.partner ? c.position.clone().lerp(c.partner.position, 0.5) : c.position;
  c.hearts?.burst(p.x, height, p.z, n, 0.2);
}

/** A little text or emoji floating up from the head ("hehe", 💤). */
function floatUp(c, content, size = 0.13) {
  const p = headPos(c);
  p.x += (Math.random() - 0.5) * 0.3;
  p.y += 0.25;
  p.z += (Math.random() - 0.5) * 0.3;
  c.fx.emoji(p, content, { vy: 0.3, life: 1.4, size });
}

// ── Standing, together ───────────────────────────────────────────────
const twirlHand = (t) => [-0.06 + 0.04 * Math.cos(t * 9), 1.1, 0.26 + 0.04 * Math.sin(t * 9)];

export const COUPLE_EMOTES = {
  twirl: {
    label: 'Twirl', emoji: '💫', duration: 2.2, lock: true, needsPartner: true,
    // Turn to them and lift your hand over their head while they spin under it.
    pose: (t, c) => ({
      rigRY: (c.partner?.angle ?? 0) * ramp(t, 0, 0.3),
      ...hands([twirlHand(t), [0, -1, 0.2], 'pinch', [0, 1, 0]], [[0.3, 0.47, 0.04], INWARD, 'fist']),
      eyesOpen: 0.5, blush: 0.4, browY: 0.3, headRX: -0.15,
    }),
    tick: once(1.9, (c) => heartsBetween(c, 6, 1.4)),
  },
  spun: {
    label: 'Spun', emoji: '💫', duration: 2.2, lock: true, reaction: true,
    pose: (t) => {
      const k = smooth(clamp((t - 0.15) / 1.6));
      return {
        rigRY: wrap(TAU * 2 * k), rigY: 0.04 * Math.abs(Math.sin(t * 7)) * (1 - k),
        ...hands([[-0.3, 0.6, 0.15], FORWARD, 'open'], [[0.05, 1.12, 0.05], [0, -1, 0], 'pinch', [0, 1, 0]]),
        eyesOpen: 0.4, mouthOpen: 0.3 * (1 - k), blush: ramp(t, 1.5, 2.0), browY: 0.4,
      };
    },
  },
  duet: {
    label: 'Dance together', emoji: '💃', loop: true, cancelOnMove: true, needsPartner: true, follows: ['duet', 'duet2'],
    pose: duetPose,
    tick: every(2.4, (c) => heartsBetween(c, 3, 1.4)),
  },
  duet2: {
    label: 'Dance together', emoji: '💃', loop: true, cancelOnMove: true, reaction: true, follows: ['duet', 'duet2'],
    pose: duetPose,
  },

  // ── The proposal ───────────────────────────────────────────────────
  propose: {
    label: 'Propose', emoji: '💍', loop: true, cancelOnMove: true, needsPartner: true, props: ['ringBox'],
    // Down on one knee, facing them, holding up an open ring box.
    pose: (t, c) => {
      const k = ramp(t, 0.2, 1.0);
      return {
        rigRY: (c.partner?.angle ?? 0) * ramp(t, 0, 0.4),
        rigY: -0.15 * k, legRF: 1.5 * k, kneeR: 1.5 * k, legLF: -0.12 * k, kneeL: 1.6 * k,
        bodyRX: 0.04 * k,
        ...both([0.055, lerp(0.45, 0.66, k), lerp(0.2, 0.34, k)], [0, 0.6, 1], 'cup'),
        headRX: -0.25 * k, eyeScale: 1 + 0.15 * k, blush: 0.5 * k, browY: 0.35 * k, browTilt: -0.35 * k,
      };
    },
    tick: (t, dt, c, state) => {
      const box = c.avatar.props?.ringBox;
      if (box?.userData.lid) box.userData.lid.rotation.x = -1.9 * ramp(t, 1.2, 1.7);
      state.next ??= 1.7;
      if (t >= state.next && box) {
        state.next = t + 0.8;
        box.getWorldPosition(tmp);
        tmp.y += 0.08;
        c.fx.emoji(tmp, '✨', { vy: 0.25, life: 1, size: 0.1 });
      }
    },
  },
  proposed: {
    label: 'Proposed to', emoji: '😳', loop: true, reaction: true, follows: ['propose'],
    pose: (t, c) => ({
      rigRY: (c.partner?.angle ?? 0) * ramp(t, 0, 0.5),
      ...cheeks(ramp(t, 0.2, 0.7)),
      eyeScale: 1.3, mouthOpen: 0.35, blush: 0.9, browY: 1, rigY: 0.02 * Math.abs(Math.sin(t * 5)),
    }),
  },
  yes: {
    label: 'Yes!', emoji: '💍', duration: 4.2, lock: true,
    start: (c) => {
      bubble(c, 'YES! 💍', 3);
      c.fx.fireworks?.(c.position, { reducedMotion: c.reducedMotion });
    },
    pose: (t, c) => {
      const jumps = [0.4, 1.2, 2.0].map((s) => clamp((t - s) / 0.6)).map((u) => Math.sin(Math.PI * u));
      const air = Math.max(...jumps);
      return {
        rigRY: (c.partner?.angle ?? 0) * ramp(t, 0, 0.4),
        rigY: 0.35 * air,
        ...both([0.26, lerp(0.93, 1.1, ramp(t, 0.3, 0.6)), 0.12], FORWARD, 'open'),
        eyesOpen: 0.3, mouthOpen: 0.6, blush: 1, browY: 0.8,
      };
    },
    tick: every(0.5, (c) => heartsBetween(c, 4, 1.6)),
  },
  yay: {
    label: 'Yay!', emoji: '🥳', duration: 3.4, reaction: true,
    pose: (t) => {
      const air = Math.sin(Math.PI * clamp((t - 0.6) / 0.6)) + Math.sin(Math.PI * clamp((t - 1.5) / 0.6));
      return { rigY: 0.3 * air, ...both([0.26, 1.06, 0.12], FORWARD, 'open'), eyesOpen: 0.3, mouthOpen: 0.5, blush: 1, browY: 0.7 };
    },
  },
};

function duetPose(t, c) {
  const beat = t * TAU * 0.9;
  const s = Math.sin(beat);
  return {
    rigRY: (c.partner?.angle ?? 0) * ramp(t, 0, 0.4),
    rigY: Math.abs(s) * 0.035, bodyRZ: 0.1 * s, headRZ: 0.16 * s,
    legRF: 0.25 * Math.max(0, s), kneeR: 0.05 + 0.4 * Math.max(0, s),
    legLF: 0.25 * Math.max(0, -s), kneeL: 0.05 + 0.4 * Math.max(0, -s),
    ...both([0.16, 0.76, 0.3], [0, 0, 1], 'relaxed'), // the game joins your hands with theirs
    eyesOpen: 0.45, blush: 0.5, browY: 0.2,
  };
}

// ── On a bench ───────────────────────────────────────────────────────
const B = {
  // A — Arm around the shoulder.
  bArm: {
    label: 'Arm around', emoji: '💞', duration: 4.2, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.2, 0.9) * (1 - ramp(t, 3.6, 4.2));
      return seated({
        ...hand(nearHand(s), [s * lerp(0.12, 0.5, k), lerp(0.49, 0.86, k), lerp(0.26, -0.1, k)], [-s, -0.4, 0.2], 'relaxed'),
        bodyRZ: -s * 0.12 * k, headRZ: -s * 0.2 * k, headRY: s * 0.25 * k, blush: 0.6 * k, eyesOpen: 1 - 0.45 * k, browY: 0.2 * k,
      });
    },
  },
  bLeanIn: { label: 'Lean in', emoji: '😌', duration: 4.2, seated: true, reaction: true, pose: leanIn(0.5, 4.2) },
  bLeanIn2: { label: 'Lean in', emoji: '😌', duration: 5.2, seated: true, reaction: true, pose: leanIn(2.1, 5.2) },

  // B — Blow a kiss, and a heart floats over.
  bKiss: {
    label: 'Blow a kiss', emoji: '😘', duration: 2.4, seated: true, pair: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const out = ramp(t, 0.6, 1.0);
      return seated({
        ...hand(nearHand(s), [s * lerp(0.04, 0.24, out), lerp(0.87, 0.98, out), lerp(0.32, 0.45, out)], [s * 0.6 * out, 0.4 * out, lerp(-1, 0.7, out)], out > 0.5 ? 'open' : 'relaxed'),
        pucker: t < 0.9 ? 1 : 0, eyesOpen: 0.4, headRZ: -s * 0.15,
      });
    },
    tick: once(0.85, (c) => {
      const p = headPos(c);
      const yaw = c.facing + (c.partner?.angle ?? 0);
      const d = c.partner ? Math.max(0.4, Math.hypot(c.partner.position.x - c.position.x, c.partner.position.z - c.position.z)) : 1.2;
      c.fx.emoji(p, '💗', { vx: (Math.sin(yaw) * d) / 1.1, vz: (Math.cos(yaw) * d) / 1.1, vy: 0.08, life: 1.2, size: 0.17 });
    }),
  },
  bCatch: {
    label: 'Catch the kiss', emoji: '🥰', duration: 2.8, seated: true, reaction: true,
    pose: (t) => seated({ ...cheeks(ramp(t, 0.9, 1.3)), blush: ramp(t, 0.9, 1.4), eyesOpen: 1 - 0.6 * ramp(t, 1.1, 1.5), browY: 0.3 }),
    tick: once(1.15, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.3, p.z, 4, 0.2);
    }),
  },

  // C — Cuddle: scoot closer together.
  bCuddle: { label: 'Cuddle', emoji: '🥰', duration: 3.6, seated: true, pair: true, scoot: true, pose: cuddle, tick: once(1, (c) => heartsBetween(c, 5, 1.2)) },
  bCuddle2: { label: 'Cuddle', emoji: '🥰', duration: 3.6, seated: true, reaction: true, scoot: true, pose: cuddle },

  // D — Happy seat dance.
  bWiggle: {
    label: 'Seat dance', emoji: '🎶', duration: 3.2, seated: true,
    pose: (t) => {
      const b = Math.sin(t * TAU * 2);
      return seated({
        rigY: 0.14 + 0.02 * Math.abs(b), bodyRZ: 0.12 * b, headRZ: 0.18 * b,
        ...hands([[-0.22, 0.78 + 0.08 * b, 0.22], FORWARD, 'fist'], [[0.22, 0.78 - 0.08 * b, 0.22], FORWARD, 'fist']),
        kneeR: 1.45 - 0.35 * Math.max(0, b), kneeL: 1.45 - 0.35 * Math.max(0, -b),
        eyesOpen: 0.4, browY: 0.3, mouthOpen: 0.2,
      });
    },
  },

  // E — Eskimo kiss (nose rub).
  bEskimo: { label: 'Eskimo kiss', emoji: '👃', duration: 3.2, seated: true, pair: true, scoot: true, pose: eskimo, tick: once(1.3, (c) => heartsBetween(c, 6, 1.25)) },
  bEskimo2: { label: 'Eskimo kiss', emoji: '👃', duration: 3.2, seated: true, reaction: true, scoot: true, pose: eskimo },

  // F — Feed each other a bite of ice cream.
  bFeed: {
    label: 'Feed ice cream', emoji: '🍦', duration: 4.2, seated: true, pair: true, scoot: true,
    props: (t, c) => [sideOf(c) > 0 ? 'iceL' : 'iceR'],
    pose: (t, c) => (besideMe(c) ? feed(t, c, 0) : eatAlone(t, c)),
  },
  bFed: {
    label: 'Fed', emoji: '😋', duration: 4.2, seated: true, reaction: true, scoot: true,
    props: (t, c) => [sideOf(c) > 0 ? 'iceL' : 'iceR'],
    pose: (t, c) => feed(t, c, 1),
  },

  // G — Giggle, with tiny "hehe" bubbles.
  bGiggle: {
    label: 'Giggle', emoji: '🤭', duration: 2.8, seated: true,
    pose: (t) => seated({
      ...hand('R', [-0.04, 0.87, 0.32], [0, 0, -1], 'relaxed'),
      bodyY: 0.01 * Math.sin(t * 28), bodyRZ: 0.04 * Math.sin(t * 14), eyesOpen: 0.3, headRZ: 0.15, headRX: 0.08, blush: 0.5, browY: 0.2,
    }),
    tick: every(0.45, (c) => floatUp(c, 'hehe')),
  },

  // H — Head on the shoulder.
  bHeadLean: {
    label: 'Head on shoulder', emoji: '😌', duration: 5, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.2, 1.0) * (1 - ramp(t, 4.4, 5));
      return seated({ rigX: s * 0.08 * k, bodyRZ: -s * 0.32 * k, headRZ: -s * 0.5 * k, eyesOpen: 1 - 0.75 * k, blush: 0.5 * k, ...both([0.1, 0.5, 0.22], TO_ME, 'relaxed') });
    },
  },
  bHeadRest: {
    label: 'Cheek on head', emoji: '🥰', duration: 5, seated: true, reaction: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.6, 1.4) * (1 - ramp(t, 4.4, 5));
      return seated({ headRZ: -s * 0.25 * k, headRX: 0.1 * k, eyesOpen: 1 - 0.6 * k, blush: 0.6 * k });
    },
  },

  // I — "I love you".
  bLove: {
    label: '“I love you”', emoji: '💬', duration: 3, seated: true, pair: true,
    start: (c) => bubble(c, 'I love you ♥', 2.6),
    pose: (t, c) => seated({ ...both([0.05, 0.72, 0.28], INWARD, 'relaxed'), headRZ: -sideOf(c) * 0.2, blush: 0.7, eyesOpen: 0.5, browY: 0.2 }),
  },
  bLoved: {
    label: 'Loved', emoji: '🥰', duration: 3, seated: true, reaction: true,
    pose: (t) => seated({ ...cheeks(ramp(t, 0.9, 1.3)), blush: ramp(t, 0.8, 1.3), eyesOpen: 1 - 0.6 * ramp(t, 1, 1.4) }),
    tick: once(1.1, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.3, p.z, 5, 0.2);
    }),
  },

  // J — Jump up excited, then sit back down.
  bJump: {
    label: 'Jump up', emoji: '🤩', duration: 1.5, seated: true,
    pose: (t) => {
      const air = Math.sin(Math.PI * clamp((t - 0.15) / 0.85));
      const legs = 1.45 * (1 - 0.85 * air);
      return seated({
        rigY: 0.14 + 0.5 * air, legRF: legs, legLF: legs, kneeR: legs, kneeL: legs,
        ...both([0.26, lerp(0.49, 1.08, air), lerp(0.26, 0.1, air)], FORWARD, 'open'),
        browY: 0.6 * air, mouthOpen: 0.4 * air, eyeScale: 1 + 0.2 * air,
      });
    },
  },

  // K — Kiss on the cheek; both blush.
  bCheekKiss: {
    label: 'Cheek kiss', emoji: '💋', duration: 3.2, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.1, 0.8) * (1 - ramp(t, 1.6, 2.2));
      return seated({
        rigX: s * 0.1 * k, bodyRZ: -s * 0.35 * k, headRY: s * 0.75 * k, headRZ: -s * 0.1 * k,
        pucker: k > 0.6 && t < 1.7 ? 1 : 0, eyesOpen: 1 - 0.85 * k, blush: Math.max(0.5 * k, ramp(t, 1.5, 2.0)),
        ...both([0.1, 0.5, 0.22], TO_ME, 'relaxed'),
      });
    },
    tick: once(1.0, (c) => heartsBetween(c, 6, 1.3)),
  },
  bCheekKissed: {
    label: 'Kissed', emoji: '😳', duration: 3.2, seated: true, reaction: true,
    pose: (t, c) => seated({ ...cheeks(ramp(t, 1.0, 1.4)), blush: ramp(t, 0.9, 1.4), eyeScale: 1 + 0.25 * pulse(t, 0.9, 1.1, 1.5, 1.9), eyesOpen: 1 - 0.6 * ramp(t, 1.8, 2.2), headRZ: sideOf(c) * 0.12 * ramp(t, 1, 1.5) }),
  },

  // L — Look into each other's eyes, then shyly look away.
  bGaze: { label: 'Look into eyes', emoji: '👀', duration: 4.2, seated: true, pair: true, pose: gaze },
  bGaze2: { label: 'Look into eyes', emoji: '👀', duration: 4.2, seated: true, reaction: true, pose: gaze },

  // M — Make a heart together with your hands.
  bHeart: {
    label: 'Heart together', emoji: '🫶', duration: 3.4, seated: true, pair: true, scoot: true,
    props: (t, c) => (t < 0.6 ? [] : besideMe(c) ? [sideOf(c) > 0 ? 'heartL' : 'heartR'] : ['heart']),
    pose: (t, c) => (besideMe(c) ? halfHeart(t, c) : seated({ ...both([0.085, 0.77, 0.3], [-1, 0, -0.3], 'heart', [-0.35, 1, 0.05]), blush: 0.6, eyesOpen: 0.45 })),
    tick: (t, dt, c, state) => {
      const beat = Math.max(0, Math.sin(t * 7));
      for (const name of ['heart', 'heartL', 'heartR']) c.avatar.props?.[name]?.scale.setScalar(0.85 + 0.25 * beat * beat);
      if (t > 1 && !state.burst) {
        state.burst = true;
        heartsBetween(c, 5, 1.3);
      }
    },
  },
  bHeart2: { label: 'Heart together', emoji: '🫶', duration: 3.4, seated: true, reaction: true, scoot: true, pose: halfHeart },

  // N — Nap: heads droop, "Zzz" floats up.
  bNap: { label: 'Nap', emoji: '😴', duration: 8, seated: true, pair: true, scoot: true, pose: nap, tick: every(1.3, (c, t) => t > 1 && floatUp(c, '💤', 0.15)) },
  bNap2: { label: 'Nap', emoji: '😴', duration: 8, seated: true, reaction: true, scoot: true, pose: nap, tick: every(1.5, (c, t) => t > 1.4 && floatUp(c, '💤', 0.13)) },

  // O — Offer a flower.
  bFlower: {
    label: 'Offer a flower', emoji: '🌹', duration: 4, seated: true, pair: true, scoot: true,
    props: (t, c) => (!besideMe(c) || t < 1.6 ? [sideOf(c) > 0 ? 'roseL' : 'roseR'] : []),
    pose: (t, c) => {
      const s = sideOf(c);
      if (!besideMe(c)) {
        const k = ramp(t, 0.3, 0.9) * (1 - ramp(t, 3.3, 4));
        return seated({ ...hand(nearHand(s), [s * 0.06, lerp(0.55, 0.88, k), 0.33], [-s, 0, 0.3], 'fist', [0, 1, 0.3]), eyesOpen: 1 - 0.8 * k, blush: 0.4 * k });
      }
      const k = ramp(t, 0.2, 0.9) * (1 - ramp(t, 1.6, 2.1));
      return seated({
        ...hand(nearHand(s), [s * lerp(0.15, 0.3, k), lerp(0.55, 0.78, k), lerp(0.26, 0.33, k)], [0, 0.4, 1], 'fist', [s * 0.6, 0.6, 0.5]),
        headRZ: -s * 0.15 * k, blush: 0.4 + 0.4 * k, eyesOpen: 1 - 0.3 * k,
      });
    },
  },
  bTakeFlower: {
    label: 'Take the flower', emoji: '🌹', duration: 4, seated: true, reaction: true,
    props: (t, c) => (t > 1.5 ? [sideOf(c) > 0 ? 'roseL' : 'roseR'] : []),
    pose: (t, c) => {
      const s = sideOf(c);
      const reach = ramp(t, 0.9, 1.4) * (1 - ramp(t, 1.5, 2.0));
      const smell = ramp(t, 1.6, 2.2) * (1 - ramp(t, 3.4, 4));
      const at = smell > 0.01
        ? [s * lerp(0.2, 0.06, smell), lerp(0.6, 0.9, smell), 0.33]
        : [s * lerp(0.12, 0.32, reach), lerp(0.49, 0.78, reach), lerp(0.26, 0.33, reach)];
      return seated({ ...hand(nearHand(s), at, [-s * 0.5, 0, 0.5], reach > 0.5 || smell > 0 ? 'fist' : 'relaxed', smell > 0.3 ? [0, 1, 0.3] : null), eyesOpen: 1 - 0.8 * smell, blush: ramp(t, 1.2, 1.8) });
    },
    tick: once(2.2, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.3, p.z, 4, 0.2);
    }),
  },

  // P — Photo selfie: a flash, and a real screenshot of the scene.
  bSelfie: {
    label: 'Selfie', emoji: '🤳', duration: 3, seated: true, pair: true, scoot: true, selfie: true,
    props: (t, c) => [sideOf(c) > 0 ? 'phoneR' : 'phoneL'], // in the hand away from them
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.1, 0.7) * (1 - ramp(t, 2.5, 3));
      return seated({
        // The phone held up and out to the side, its screen towards you; ✌️ by your cheek.
        ...hand(farHand(s), [-s * lerp(0.12, 0.3, k), lerp(0.55, 1.0, k), lerp(0.26, 0.25, k)], [s * 0.5, 0, -0.8], 'fist', [0, 1, 0]),
        ...hand(nearHand(s), [s * lerp(0.12, 0.17, k), lerp(0.49, 0.93, k), lerp(0.26, 0.3, k)], FORWARD, k > 0.5 ? 'peace' : 'relaxed'),
        bodyRZ: -s * 0.07 * k, headRZ: -s * 0.14 * k, headRX: -0.1 * k,
        wink: pulse(t, 1.1, 1.3, 2.0, 2.3), eyesOpen: 1, blush: 0.3, browY: 0.2,
      });
    },
  },
  bPose: {
    label: 'Say cheese', emoji: '✌️', duration: 3, seated: true, reaction: true, selfie: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.3, 0.9) * (1 - ramp(t, 2.5, 3));
      return seated({ ...hand(farHand(s), [-s * 0.2, lerp(0.49, 0.98, k), 0.25], FORWARD, k > 0.5 ? 'peace' : 'relaxed'), bodyRZ: -s * 0.07 * k, headRZ: -s * 0.14 * k, mouthOpen: 0.2 * k, blush: 0.3 });
    },
  },

  // Q — Quiet moment: everything slows down and the music softens.
  bQuiet: { label: 'Quiet moment', emoji: '🕯️', duration: 4, seated: true, pair: true, scoot: true, quiet: true, pose: quiet },
  bQuiet2: { label: 'Quiet moment', emoji: '🕯️', duration: 4, seated: true, reaction: true, scoot: true, quiet: true, pose: quiet },

  // R — Rest: both lean back and relax, legs swinging.
  bRest: { label: 'Rest', emoji: '😎', duration: 6, seated: true, pair: true, pose: rest },
  bRest2: { label: 'Rest', emoji: '😎', duration: 6, seated: true, reaction: true, pose: rest },

  // T — Tickle attack: the other one falls over sideways on the bench, laughing.
  bTickle: {
    label: 'Tickle attack', emoji: '😆', duration: 2.8, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      if (!besideMe(c)) return seated({ ...hands([[-0.15, 0.75, 0.42], FORWARD, wiggle(t)], [[0.15, 0.75, 0.42], FORWARD, wiggle(t + 0.3)]), eyesOpen: 0.5, browY: 0.3 });
      return seated({
        rigX: s * 0.05, bodyRZ: -s * 0.2,
        ...hand(nearHand(s), [s * (0.4 + 0.04 * Math.sin(t * 25)), 0.6, 0.12], [s, 0, 0.3], wiggle(t)),
        ...hand(farHand(s), [s * (0.26 + 0.04 * Math.sin(t * 25 + 1.5)), 0.62, 0.3], [s, 0, 0.3], wiggle(t + 0.3)),
        eyesOpen: 0.5, mouthOpen: 0.3, browY: 0.3, browTilt: 0.3,
      });
    },
  },
  bTickled: {
    label: 'Tickled', emoji: '😂', duration: 3.6, seated: true, reaction: true,
    start: (c) => bubble(c, 'Hahaha 😂', 2.6),
    pose: (t, c) => {
      const s = sideOf(c);
      const down = ramp(t, 0.35, 0.8) * (1 - ramp(t, 3.0, 3.6));
      return seated({
        rigPivot: 0.36, rigRZ: s * 1.15 * down, // over sideways, away from the tickler
        kneeR: 1.45 - 0.6 * down * (0.5 + 0.5 * Math.sin(t * 16)), kneeL: 1.45 - 0.6 * down * (0.5 + 0.5 * Math.sin(t * 16 + Math.PI)),
        ...hands([[-0.1 + 0.08 * Math.sin(t * 20), 0.55, 0.25], TO_ME, 'relaxed'], [[0.1 + 0.08 * Math.sin(t * 20 + 2), 0.55, 0.25], TO_ME, 'relaxed']),
        mouthOpen: 0.9, eyesOpen: 0.1, bodyY: 0.012 * Math.sin(t * 22), browY: 0.5,
      });
    },
    tick: every(0.55, (c, t) => t > 0.6 && t < 3 && floatUp(c, 'haha', 0.14)),
  },

  // U — Uno reverse: a kiss for the cheek lands on the lips; both freeze, then blush.
  bUno: { label: 'Uno reverse', emoji: '🔄', duration: 4, seated: true, pair: true, scoot: true, pose: (t, c) => uno(t, c, false), tick: once(1.0, (c) => heartsBetween(c, 10, 1.3)) },
  bUno2: { label: 'Uno reverse', emoji: '🔄', duration: 4, seated: true, reaction: true, scoot: true, pose: (t, c) => uno(t, c, true) },

  // V — A cute pose forward with the peace sign.
  bPeace: {
    label: 'Peace', emoji: '✌️', duration: 2.4, seated: true,
    pose: () => seated({ ...hand('R', [-0.14, 0.97, 0.33], [0, 0, 1], 'peace'), wink: 1, headRZ: -0.25, bodyRX: 0.1, blush: 0.35, browY: 0.3 }),
  },

  // W — Whisper a secret: the other one blushes and smiles.
  bWhisper: {
    label: 'Whisper', emoji: '🤫', duration: 3.4, seated: true, pair: true, scoot: true,
    start: (c) => bubble(c, 'psst… 🤫', 1.6),
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.1, 0.7) * (1 - ramp(t, 2.6, 3.2));
      return seated({
        rigX: s * 0.1 * k, bodyRZ: -s * 0.38 * k, headRY: s * 0.8 * k,
        ...hand(nearHand(s), [s * 0.1, lerp(0.49, 0.92, k), lerp(0.26, 0.3, k)], [s * 0.8, 0, 0.4], k > 0.5 ? 'cup' : 'relaxed'),
        wink: ramp(t, 2.7, 3.0), eyesOpen: 0.8,
      });
    },
  },
  bSecret: {
    label: 'A secret', emoji: '😊', duration: 3.4, seated: true, reaction: true,
    pose: (t, c) => seated({ ...cheeks(ramp(t, 1.4, 1.8)), blush: ramp(t, 1.3, 1.8), eyesOpen: 1 - 0.7 * ramp(t, 1.5, 1.9), headRZ: sideOf(c) * 0.15 * ramp(t, 1.4, 1.9) }),
    tick: once(1.9, (c) => {
      const p = headPos(c);
      c.hearts?.burst(p.x, p.y + 0.3, p.z, 4, 0.2);
    }),
  },

  // X — A big hug together, or (alone) a hug for nobody… and tears.
  bBigHug: { label: 'Big hug', emoji: '🤗', duration: 3.4, seated: true, pair: true, scoot: true, pose: bigHug, tick: once(0.7, (c) => heartsBetween(c, 8, 1.3)) },
  bBigHug2: { label: 'Big hug', emoji: '🤗', duration: 3.4, seated: true, reaction: true, scoot: true, pose: bigHug },
  bHugFail: {
    label: 'Big hug', emoji: '🤗', duration: 4.6, seated: true,
    pose: (t) => {
      const open = ramp(t, 0.1, 0.8) * (1 - ramp(t, 1.0, 1.4));
      const hug = ramp(t, 1.0, 1.4) * (1 - ramp(t, 1.9, 2.3));
      const cry = ramp(t, 2.1, 2.5) * (1 - ramp(t, 4.2, 4.6));
      const arm = [lerp(lerp(0.12, 0.42, open), 0.06, hug), lerp(lerp(0.49, 0.8, open), 0.72, hug), lerp(lerp(0.26, 0.25, open), 0.5, hug)];
      const pose = cry > 0.05
        ? both([0.09 + 0.015 * Math.sin(t * 10), 0.93, 0.31], [-0.3, 0, -1], 'fist')
        : both(arm, hug > 0.5 ? TO_ME : FORWARD, 'open');
      return seated({
        ...pose, rigRY: 0.5 * (open + hug) * (1 - cry), headRX: 0.3 * pulse(t, 1.6, 1.8, 2.0, 2.2) + 0.25 * cry,
        eyeScale: 1 + 0.3 * pulse(t, 1.5, 1.7, 1.9, 2.1), eyesOpen: 1 - 0.85 * cry, mouthOpen: 0.25 * cry, browTilt: -cry, browY: 0.2 * cry,
      });
    },
    tick: (t, dt, c, state) => {
      if (t > 2.0 && !state.said) {
        state.said = true;
        bubble(c, '…😢', 1.5);
      }
      state.next ??= 2.3;
      if (t >= state.next && t < 4.2) {
        state.next = t + 0.13;
        const eye = c.avatar.eyes?.[Math.random() < 0.5 ? 0 : 1];
        if (!eye) return;
        eye.getWorldPosition(tmp);
        c.fx.emoji(tmp, '💧', { vx: (Math.random() - 0.5) * 0.5, vy: 0.4, gravity: 2.5, life: 0.8, size: 0.08 });
      }
    },
  },

  // Y — The classic yawn-and-stretch that ends with an arm around them.
  bYawn: {
    label: 'Yawn & stretch', emoji: '🥱', duration: 5.2, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const stretch = pulse(t, 0.3, 0.9, 1.5, 2.0);
      const arm = ramp(t, 1.6, 2.2) * (1 - ramp(t, 4.6, 5.2));
      const up = (x) => [x, lerp(0.49, 1.1, stretch), lerp(0.26, -0.02, stretch)];
      const around = [s * 0.5, 0.88, -0.08];
      const near = arm > 0.001 ? up(s * 0.15).map((v, i) => lerp(v, around[i], arm)) : up(s * 0.15);
      return seated({
        ...hand(farHand(s), up(-s * 0.15), UP, 'open'),
        ...hand(nearHand(s), near, arm > 0.5 ? [-s, -0.4, 0.2] : UP, arm > 0.5 ? 'relaxed' : 'open'),
        mouthOpen: pulse(t, 0.2, 0.7, 1.4, 1.9), eyesOpen: 1 - 0.85 * stretch, headRX: -0.25 * stretch,
        headRY: -s * 0.35 * arm, browY: 0.4 * arm, // …looking away, all innocent
      });
    },
  },

  // Z — Lie down on the bench with your head in their lap, and sleep.
  bLap: {
    label: 'Head in lap', emoji: '💤', loop: true, seated: true, pair: true, scoot: true,
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.2, 1.2);
      return seated({
        rigPivot: 0.36, rigRZ: -s * 1.25 * k, rigY: 0.14 + 0.06 * k, rigZ: 0.3 * k, rigX: -s * 0.1 * k,
        legRF: 1.45 - 0.4 * k, legLF: 1.45 - 0.5 * k, kneeR: 1.45 - 0.6 * k, kneeL: 1.45 - 0.4 * k,
        ...both([0.1, 0.5, 0.25], TO_ME, 'relaxed'), eyesOpen: 1 - 0.95 * k, headRZ: -s * 0.25 * k, blush: 0.4 * k,
      });
    },
    tick: every(1.4, (c, t) => t > 1.2 && floatUp(c, '💤', 0.15)),
  },
  bLapHold: {
    label: 'Lap pillow', emoji: '🥰', loop: true, seated: true, reaction: true, follows: ['bLap'],
    pose: (t, c) => {
      const s = sideOf(c);
      const k = ramp(t, 0.6, 1.6);
      return seated({
        headRX: 0.35 * k, headRY: s * 0.35 * k,
        ...hand(nearHand(s), [s * lerp(0.12, 0.35 + 0.04 * Math.sin(t * 2.2), k), lerp(0.49, 0.72, k), lerp(0.26, 0.18, k)], DOWN, 'relaxed'),
        eyesOpen: 1 - 0.4 * k, blush: 0.4 * k,
      });
    },
  },
};
Object.assign(COUPLE_EMOTES, B);

/** While seated, the keys A–Z do these instead (S still stands up). */
export const BENCH_MENU = {
  A: 'bArm', B: 'bKiss', C: 'bCuddle', D: 'bWiggle', E: 'bEskimo', F: 'bFeed', G: 'bGiggle', H: 'bHeadLean', I: 'bLove',
  J: 'bJump', K: 'bCheekKiss', L: 'bGaze', M: 'bHeart', N: 'bNap', O: 'bFlower', P: 'bSelfie', Q: 'bQuiet', R: 'bRest',
  S: 'S', T: 'bTickle', U: 'bUno', V: 'bPeace', W: 'bWhisper', X: 'bBigHug', Y: 'bYawn', Z: 'bLap',
};

/** Who reacts how when a couple action targets them. */
export const COUPLE_REACTIONS = {
  twirl: 'spun', duet: 'duet2', propose: 'proposed', yes: 'yay',
  bArm: 'bLeanIn', bKiss: 'bCatch', bCuddle: 'bCuddle2', bEskimo: 'bEskimo2', bFeed: 'bFed', bHeadLean: 'bHeadRest',
  bLove: 'bLoved', bCheekKiss: 'bCheekKissed', bGaze: 'bGaze2', bHeart: 'bHeart2', bNap: 'bNap2', bFlower: 'bTakeFlower',
  bSelfie: 'bPose', bQuiet: 'bQuiet2', bRest: 'bRest2', bTickle: 'bTickled', bUno: 'bUno2', bWhisper: 'bSecret',
  bBigHug: 'bBigHug2', bYawn: 'bLeanIn2', bLap: 'bLapHold',
};

// ── Shared poses ─────────────────────────────────────────────────────
function leanIn(from, duration) {
  return (t, c) => {
    const s = sideOf(c);
    const k = ramp(t, from, from + 0.8) * (1 - ramp(t, duration - 0.6, duration));
    return seated({ bodyRZ: -s * 0.18 * k, headRZ: -s * 0.35 * k, eyesOpen: 1 - 0.7 * k, blush: 0.8 * k, ...both([0.06, 0.52, 0.24], INWARD, 'relaxed') });
  };
}

function cuddle(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.3, 1.0) * (1 - ramp(t, 3.0, 3.6));
  return seated({
    bodyRZ: -s * 0.2 * k, headRZ: -s * 0.35 * k, eyesOpen: 1 - 0.75 * k, blush: 0.6 * k,
    ...hand(nearHand(s), [s * lerp(0.12, 0.4, k), lerp(0.49, 0.56, k), lerp(0.26, -0.04, k)], [-s, 0, 0], 'relaxed'),
  });
}

function eskimo(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.2, 0.8) * (1 - ramp(t, 2.6, 3.2));
  const rub = Math.sin(t * 14) * pulse(t, 0.8, 1.0, 2.2, 2.5);
  return seated({ bodyRZ: -s * 0.32 * k, rigX: s * 0.06 * k, headRY: s * 0.7 * k, headRZ: -s * 0.15 * k + 0.12 * rub, eyesOpen: 1 - 0.85 * k, blush: 0.8 * k, ...both([0.1, 0.5, 0.22], TO_ME, 'relaxed') });
}

/** Feeding: `who` 0 = the one who started (feeds first), 1 = the other one (eats first). */
function feed(t, c, who) {
  const s = sideOf(c);
  const give = who === 0 ? [0.2, 1.4] : [1.9, 3.1]; // when my hand goes over to their mouth
  const eat = who === 0 ? [2.0, 3.1] : [0.6, 1.6]; // when I lean in for a bite
  const g = ramp(t, give[0], give[0] + 0.4) * (1 - ramp(t, give[1] - 0.3, give[1]));
  const e = ramp(t, eat[0], eat[0] + 0.4) * (1 - ramp(t, eat[1] - 0.2, eat[1] + 0.2));
  const chew = t > eat[1] - 0.2 && t < eat[1] + 0.8 ? 0.15 * Math.abs(Math.sin(t * 12)) : 0;
  return seated({
    ...hand(nearHand(s), [s * lerp(0.18, 0.3, g), lerp(0.62, 0.9, g), lerp(0.3, 0.3, g)], [0, 0.3, 1], 'fist', [s * lerp(0.2, 0.9, g), 0.4, 0.3]),
    bodyRZ: -s * 0.18 * e, headRY: s * 0.45 * e, mouthOpen: Math.max(0.6 * e * (e > 0.7 ? 1 : 0), chew), eyesOpen: 1 - 0.5 * e, blush: 0.4,
  });
}

function eatAlone(t, c) {
  const s = sideOf(c);
  const bite = Math.sin(((t % 1.4) / 1.4) * Math.PI) ** 2;
  return seated({ ...hand(nearHand(s), [s * lerp(0.18, 0.06, bite), lerp(0.62, 0.86, bite), 0.32], [0, 0.3, 1], 'fist', [0, 1, 0.3]), mouthOpen: bite > 0.8 ? 0.5 : 0.1, eyesOpen: 1 - 0.5 * bite });
}

function gaze(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.2, 0.9);
  const away = ramp(t, 2.2, 2.7) * (1 - ramp(t, 3.7, 4.2));
  const look = k * (1 - ramp(t, 2.2, 2.7));
  return seated({
    headRY: s * 0.85 * look - s * 0.45 * away, headRX: 0.25 * away, bodyRZ: -s * 0.08 * look,
    eyeScale: 1 + 0.15 * look, eyesOpen: 1 - 0.5 * away, blush: 0.2 * k + 0.8 * away,
  });
}

function halfHeart(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.2, 0.7) * (1 - ramp(t, 2.9, 3.4));
  return seated({
    ...hand(nearHand(s), [s * lerp(0.12, 0.17, k), lerp(0.49, 0.86, k), lerp(0.26, 0.29, k)], [s, 0, -0.3], k > 0.5 ? 'heart' : 'relaxed', k > 0.5 ? [s * 0.35, 1, 0.05] : null),
    bodyRZ: -s * 0.12 * k, headRZ: -s * 0.15 * k, blush: 0.6 * k, eyesOpen: 1 - 0.5 * k,
  });
}

function nap(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.3, 1.5) * (1 - ramp(t, 7.3, 8));
  return seated({
    headRX: 0.45 * k, headRZ: -s * 0.35 * k, bodyRZ: -s * 0.1 * k, bodyRX: -0.04 + 0.08 * k,
    eyesOpen: 1 - 0.92 * k, mouthOpen: 0.1 * k * (0.5 + 0.5 * Math.sin(t * 1.5)), ...both([0.08, 0.5, 0.22], TO_ME, 'relaxed'),
  });
}

function quiet(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.2, 1.0) * (1 - ramp(t, 3.4, 4));
  return seated({ bodyRZ: -s * 0.12 * k, headRZ: -s * 0.22 * k, eyesOpen: 1 - 0.55 * k, bodyY: 0.006 * Math.sin(t * 1.4), blush: 0.4 * k, ...both([0.06, 0.52, 0.24], INWARD, 'relaxed') });
}

function rest(t) {
  const k = ramp(t, 0.2, 0.9) * (1 - ramp(t, 5.3, 6));
  const swing = (phase) => 1.45 - 0.45 * k * (0.5 + 0.5 * Math.sin(t * 4 + phase));
  return seated({
    bodyRX: -0.04 - 0.3 * k, headRX: -0.15 * k,
    ...both([0.15, lerp(0.49, 1.0, k), lerp(0.26, -0.12, k)], k > 0.5 ? [0, -0.2, 1] : DOWN, 'relaxed'),
    kneeR: swing(0), kneeL: swing(Math.PI), eyesOpen: 1 - 0.4 * k,
  });
}

function uno(t, c, turner) {
  const s = sideOf(c);
  const frozen = t > 1.0 && t < 2.3;
  const away = ramp(t, 2.3, 2.8) * (1 - ramp(t, 3.5, 4));
  if (turner) {
    // Sitting there… turns at the last second.
    const turn = ramp(t, 0.75, 0.95) * (1 - ramp(t, 2.3, 2.8));
    return seated({
      headRY: s * 0.9 * turn - s * 0.4 * away, bodyRZ: -s * 0.1 * turn, pucker: t > 0.9 && t < 1.1 ? 1 : 0,
      eyeScale: frozen ? 1.4 : 1, eyesOpen: frozen ? 1 : 1 - 0.6 * away, blush: ramp(t, 1.2, 1.6),
    });
  }
  const lean = ramp(t, 0.1, 0.8) * (1 - ramp(t, 2.3, 2.8));
  return seated({
    rigX: s * 0.1 * lean, bodyRZ: -s * 0.35 * lean, headRY: s * 0.75 * lean - s * 0.4 * away,
    pucker: t > 0.5 && t < 1.1 ? 1 : 0, eyeScale: frozen ? 1.4 : 1, eyesOpen: t < 1.0 ? 1 - 0.85 * lean : frozen ? 1 : 1 - 0.6 * away,
    blush: ramp(t, 1.2, 1.6), ...both([0.1, 0.5, 0.22], TO_ME, 'relaxed'),
  });
}

function bigHug(t, c) {
  const s = sideOf(c);
  const k = ramp(t, 0.1, 0.6) * (1 - ramp(t, 2.8, 3.4));
  return seated({
    rigRY: s * 0.55 * k, rigX: s * 0.08 * k, bodyRZ: -s * 0.15 * k, bodyRX: 0.1 * k,
    ...hands(
      [[lerp(-0.12, 0.06, k), lerp(0.49, 0.72, k), lerp(0.26, 0.52, k)], k > 0.5 ? TO_ME : DOWN, 'relaxed'],
      [[lerp(0.12, -0.06, k), lerp(0.49, 0.7, k), lerp(0.26, 0.5, k)], k > 0.5 ? TO_ME : DOWN, 'relaxed'],
    ),
    headRZ: 0.25 * k, eyesOpen: 1 - 0.8 * k, blush: 0.6 * k,
  });
}
