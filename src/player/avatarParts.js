/**
 * The pieces of the procedural avatar that the visitor chooses in the avatar
 * studio: face, hair, clothes, shoes, hats, glasses and extras. Each builder
 * takes the avatar (avatar.js) and adds meshes to its body or head.
 *
 * Coordinates: body space has the feet at y = 0 and the face towards +z
 * (shoulders y 0.735, chest surface z ≈ avatar.front); head space has the
 * head's centre at 0 (radius 0.3, face at z ≈ 0.3).
 */
import * as THREE from 'three';
import { heartShape } from '../world/finale.js';

export const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
export const capsule = (r, l, c = 4, s = 14) => new THREE.CapsuleGeometry(r, l, c, s);
export const sphere = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** A mesh at a position, added to `parent`. */
function put(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Stick a flat shape onto the face at (x, y), facing outwards. */
function onFace(a, obj, x, y, lift = 0.004) {
  const r = 0.296 + lift;
  obj.position.set(x, y, Math.sqrt(Math.max(0, r * r - x * x - y * y)));
  obj.quaternion.setFromUnitVectors(Z, obj.position.clone().normalize());
  a.head.add(obj);
  return obj;
}

/** Point a mesh's local +Y along `dir`. */
function aim(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
  return mesh;
}

/** A five-pointed star, `size` across. */
export function starShape(size) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.4 : 1) * size * 0.5;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return shape;
}

/** What the chosen top and bottom cover: sleeves, thighs, shins. */
export function outfitInfo(look) {
  const top = look.top;
  const dress = top === 'dress';
  const trousers = !dress && ['pants', 'jeans', 'cargo'].includes(look.bottom);
  return {
    sleeves: ['tank', 'dress'].includes(top) ? 'none' : ['tshirt', 'overalls', 'jersey'].includes(top) ? 'short' : 'long',
    thighs: trousers || (!dress && look.bottom === 'shorts') ? 'bottom' : 'skin',
    shins: trousers ? 'bottom' : 'skin',
    cuff: top === 'cardigan' ? 'accent' : 'dark',
    armStripes: top === 'jersey',
  };
}

// ── Clothes ──────────────────────────────────────────────────────────────

/** The torso's fabric: plain, or a print in the print colour. */
export function topMaterial(a) {
  const { pattern, topColor, accent } = a.look;
  if (!PRINTS.includes(pattern)) return a.mats.top;
  return new THREE.MeshLambertMaterial({ map: printTexture(pattern, topColor, accent) });
}
const PRINTS = ['stripes', 'dots', 'checks', 'flowers', 'zigzag', 'rainbow'];

/** Collars, hoods, lapels, buttons… and the heart / star on the chest. */
export function buildTop(a) {
  const { look, mats: m, body } = a;
  const top = look.top;
  const front = a.front * (top === 'puffer' ? 1.1 : 1);
  const collar = (tube, material = m.topDark) => {
    const c = put(body, new THREE.TorusGeometry(0.075, tube, 8, 20), material, 0, 0.765, 0);
    c.rotation.x = Math.PI / 2;
    return c;
  };
  // An open front (jacket, blazer, cardigan): a T-shirt or shirt in the V, and two lapels.
  const openFront = (inner, lapel, lapelZ = 0.3) => {
    const v = new THREE.Shape([new THREE.Vector2(-0.075, 0.1), new THREE.Vector2(0.075, 0.1), new THREE.Vector2(0, -0.13)]);
    const tee = put(body, new THREE.ShapeGeometry(v), inner, 0, 0.63, front + 0.002);
    tee.rotation.x = -0.15; // leaning back with the chest
    for (const s of [-1, 1]) {
      const l = put(body, new THREE.BoxGeometry(0.03, 0.18, 0.02), lapel, s * 0.075, 0.64, front - 0.005);
      l.rotation.z = s * lapelZ;
    }
  };
  let badgeAt = [0, 0.6, front + 0.002, 1];

  if (top === 'sweater') collar(0.022);
  else if (top === 'tshirt') collar(0.016);
  else if (top === 'jersey') {
    collar(0.016, m.accent);
    const number = put(body, new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ map: numberTexture(look.accent), transparent: true }), 0, 0.57, front + 0.003);
    number.renderOrder = 1;
    badgeAt = null;
  } else if (top === 'hoodie') {
    collar(0.022, m.top);
    const hood = put(body, new THREE.TorusGeometry(0.15, 0.075, 10, 18, Math.PI * 1.25), m.top, 0, 0.79, -0.08);
    hood.rotation.set(-0.5, 0, Math.PI * 1.375);
    for (const s of [-1, 1]) put(body, new THREE.CylinderGeometry(0.007, 0.007, 0.12, 6), m.accent, s * 0.045, 0.69, 0.165);
    put(body, new THREE.BoxGeometry(0.2, 0.07, 0.02), m.topDark, 0, 0.5, 0.16);
    badgeAt = [0, 0.62, front + 0.002, 0.8];
  } else if (top === 'shirt') {
    // A collar with two points, and buttons down the front.
    collar(0.018);
    for (const s of [-1, 1]) {
      const point = put(body, new THREE.ConeGeometry(0.045, 0.08, 3), m.accent, s * 0.05, 0.735, front - 0.02);
      point.rotation.set(-0.5, 0, s * 2.6);
    }
    for (const y of [0.66, 0.58, 0.5]) put(body, sphere(0.011, 8, 6), m.accent, 0, y, front + 0.005);
    badgeAt = [0.075, 0.6, front + 0.002, 0.55]; // a little one on the pocket
  } else if (top === 'jacket') {
    openFront(m.accent, m.topDark);
    badgeAt = null;
  } else if (top === 'blazer') {
    openFront(m.cloth, m.topDark, 0.38);
    for (const y of [0.5, 0.44]) put(body, sphere(0.012, 8, 6), m.dark, 0, y, front + 0.004);
    put(body, new THREE.BoxGeometry(0.05, 0.022, 0.012), m.accent, 0.1, 0.64, front - 0.004); // pocket square
    const tails = put(body, new THREE.CylinderGeometry(0.198, 0.212, 0.13, 22, 1, true), mat(look.topColor, { side: THREE.DoubleSide }), 0, 0.37, 0);
    tails.scale.set(a.build * 1.04, 1, 0.86 * a.depth);
    badgeAt = null;
  } else if (top === 'cardigan') {
    openFront(m.accent, m.topDark, 0.22);
    for (const y of [0.52, 0.46, 0.4]) put(body, sphere(0.012, 8, 6), m.accent, 0.012, y, front + 0.004);
    badgeAt = null;
  } else if (top === 'dress') {
    collar(0.014);
  } else if (top === 'tank') {
    // A scoop neckline.
    const neckline = put(body, sphere(0.085, 18, 10), m.skin, 0, 0.75, 0.085);
    neckline.scale.set(1.35, 0.8, 0.8);
  } else if (top === 'turtleneck') {
    put(body, new THREE.CylinderGeometry(0.07, 0.074, 0.12, 18), m.top, 0, 0.81, 0);
    const fold = put(body, new THREE.TorusGeometry(0.07, 0.016, 8, 20), m.topDark, 0, 0.85, 0);
    fold.rotation.x = Math.PI / 2;
  } else if (top === 'overalls') {
    collar(0.016);
    // The bib and straps are made of the trousers' fabric.
    put(body, new THREE.BoxGeometry(0.2, 0.17, 0.025), m.bottom, 0, 0.555, front + 0.004);
    for (const s of [-1, 1]) {
      const strap = put(body, new THREE.TorusGeometry(0.17, 0.013, 6, 24, Math.PI), m.bottom, s * 0.085, 0.6, 0);
      strap.rotation.y = Math.PI / 2;
      strap.scale.set(0.98 * a.depth, 1.45, 1);
      put(body, sphere(0.014, 10, 8), m.gold, s * 0.075, 0.62, front + 0.02);
    }
    badgeAt = [0, 0.545, front + 0.018, 0.75];
  } else if (top === 'puffer') {
    const c = collar(0.035, m.top);
    c.scale.set(1.1, 1.1, 1);
    for (const y of [0.47, 0.58, 0.69]) {
      const r = y > 0.665 ? Math.sqrt(0.19 ** 2 - (y - 0.665) ** 2) : 0.19;
      const ring = put(body, new THREE.TorusGeometry(r, 0.013, 6, 28), m.topDark, 0, y, 0);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(a.torso.scale.x, a.torso.scale.z, 1);
    }
    put(body, new THREE.BoxGeometry(0.008, 0.38, 0.01), m.topDark, 0, 0.56, front + 0.002);
    badgeAt = null;
  }

  if (badgeAt && (look.pattern === 'heart' || look.pattern === 'star')) {
    const [x, y, z, size] = badgeAt;
    const shape = look.pattern === 'heart' ? heartShape(0.1) : starShape(0.065);
    const badge = put(body, new THREE.ShapeGeometry(shape, 8), basic(look.accent), x, y, z);
    badge.scale.setScalar(size);
  }
}

/** Stripes round the short sleeves (jersey). */
export function sleeveStripes(a, upper) {
  const ring = put(upper, new THREE.TorusGeometry(0.06, 0.008, 6, 16), a.mats.accent, 0, -0.06, 0);
  ring.rotation.x = Math.PI / 2;
}

/** Waistband and belt, skirts, the dress's skirt; jeans' pockets. */
export function buildBottom(a) {
  const { look, mats: m, body } = a;
  const dress = look.top === 'dress';
  const trousers = ['pants', 'jeans', 'cargo', 'shorts'].includes(look.bottom);
  if (trousers && !dress) {
    // The seat of the trousers (otherwise the jumper would show between the legs).
    const seat = put(body, new THREE.SphereGeometry(0.19, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.bottom, 0, 0.42, 0);
    seat.scale.set(a.torso.scale.x, 1, a.torso.scale.z);
    const waist = put(body, new THREE.CylinderGeometry(0.188, 0.19, 0.07, 22), m.bottom, 0, 0.41, 0);
    waist.scale.set(a.torso.scale.x, 1, a.torso.scale.z);
    const belt = put(body, new THREE.TorusGeometry(0.188, 0.011, 6, 26), look.bottom === 'cargo' ? mat('#5a4632') : m.dark, 0, 0.44, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(a.torso.scale.x, a.torso.scale.z, 1);
    if (look.bottom === 'cargo') put(body, new THREE.BoxGeometry(0.04, 0.03, 0.01), m.gold, 0, 0.44, 0.172 * a.depth);
    if (look.bottom === 'jeans') {
      for (const s of [-1, 1]) put(body, new THREE.BoxGeometry(0.07, 0.06, 0.012), m.bottomDark, s * 0.075, 0.38, -0.165 * a.depth);
    }
  }
  if (dress || look.bottom === 'skirt' || look.bottom === 'longskirt') {
    const long = look.bottom === 'longskirt';
    const h = long ? 0.36 : 0.24;
    const skirt = put(
      body,
      new THREE.CylinderGeometry(0.19, long ? 0.33 : 0.3, h, 26, 1, true),
      mat(dress ? look.topColor : look.bottomColor, { side: THREE.DoubleSide }),
      0, 0.48 - h / 2, 0,
    );
    skirt.scale.set(a.build, 1, 0.9);
    const hem = put(body, new THREE.TorusGeometry(long ? 0.33 : 0.3, 0.008, 6, 30), dress ? m.topDark : m.bottomDark, 0, 0.48 - h, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(a.build, 0.9, 1);
  }
}

/** Per-leg details: turned-up jeans, cargo pockets, shorts' hems. */
export function buildLegwear(a, s, hip, knee) {
  const { look, mats: m } = a;
  if (look.top === 'dress') return;
  if (look.bottom === 'jeans') {
    put(knee, new THREE.CylinderGeometry(0.069, 0.069, 0.035, 16), mat(shade(look.bottomColor, 1.3)), 0, -0.125, 0); // turned up
  } else if (look.bottom === 'cargo') {
    put(hip, new THREE.BoxGeometry(0.025, 0.075, 0.07), m.bottomDark, s * 0.068, -0.1, 0);
  } else if (look.bottom === 'shorts') {
    const hem = put(hip, new THREE.TorusGeometry(0.072, 0.01, 6, 16), m.bottomDark, 0, -0.17, 0);
    hem.rotation.x = Math.PI / 2;
  }
}

/** Shoes (in the foot's space: the floor is at y = −0.025). */
export function buildShoe(a, s, foot, knee) {
  const { look, mats: m } = a;
  const style = look.shoeStyle;
  const sole = (r, h, material, y = -0.015) => {
    const so = put(foot, new THREE.CylinderGeometry(r, r, h, 16), material, 0, y, 0.035);
    so.scale.set(1, 1, 1.45);
    return so;
  };
  if (style === 'sandals') {
    const toes = put(foot, sphere(0.06, 16, 10), m.skin, 0, 0.0, 0.04);
    toes.scale.set(1, 0.55, 1.5);
    sole(0.07, 0.016, m.shoes, -0.017);
    for (const z of [0.0, 0.07]) put(foot, new THREE.TorusGeometry(0.062, 0.009, 6, 16, Math.PI), m.shoes, 0, -0.015, z).scale.y = 0.85;
    return;
  }
  if (style === 'slippers') {
    const fluffy = put(foot, new THREE.IcosahedronGeometry(0.085, 3), m.shoes, 0, 0.02, 0.04);
    fluffy.scale.set(1.05, 0.72, 1.45);
    const pink = mat('#ffb3c6');
    for (const x of [-0.028, 0.028]) {
      const ear = put(foot, capsule(0.018, 0.06, 3, 8), m.shoes, x, 0.085, -0.005);
      ear.rotation.set(-0.5, 0, x * 6);
      const inner = put(ear, capsule(0.009, 0.045, 2, 6), pink, 0, 0, 0.01);
      inner.scale.z = 0.5;
    }
    for (const x of [-0.025, 0.025]) put(foot, sphere(0.009, 8, 6), m.dark, x, 0.06, 0.135);
    put(foot, sphere(0.01, 8, 6), pink, 0, 0.045, 0.152);
    return;
  }
  if (style === 'heels') {
    const shoe = put(foot, sphere(0.07, 18, 10), m.shoes, 0, 0.012, 0.035);
    shoe.scale.set(0.85, 0.55, 1.5);
    shoe.rotation.x = 0.12;
    put(foot, new THREE.CylinderGeometry(0.013, 0.009, 0.045, 10), m.shoes, 0, -0.003, -0.045);
    const toe = put(foot, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 14), m.dark, 0, -0.02, 0.075);
    toe.scale.z = 1.3;
    return;
  }
  // Sneakers, high-tops and boots: a rounded shoe on a sole.
  const shoe = put(foot, sphere(0.075, 20, 12), m.shoes, 0, 0.02, 0.035);
  shoe.scale.set(1, 0.62, 1.45);
  if (style === 'boots') {
    put(knee, capsule(0.072, 0.06, 3, 14), m.shoes, 0, -0.12, 0);
    sole(0.07, 0.022, mat('#3a2a22'));
    return;
  }
  sole(0.07, style === 'hightops' ? 0.03 : 0.02, m.sole, style === 'hightops' ? -0.01 : -0.015);
  const toeCap = put(foot, new THREE.SphereGeometry(0.077, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.28), m.sole, 0, 0.02, 0.035);
  toeCap.rotation.x = Math.PI / 2; // a cap round the front of the shoe
  toeCap.scale.set(1, 1.45, 0.62);
  const laces = put(foot, new THREE.BoxGeometry(0.045, 0.012, 0.045), m.sole, 0, 0.062, 0.055);
  laces.rotation.x = -0.35;
  if (style === 'hightops') {
    put(foot, new THREE.CylinderGeometry(0.07, 0.075, 0.09, 16), m.shoes, 0, 0.07, -0.005);
    const band = put(foot, new THREE.TorusGeometry(0.07, 0.01, 6, 16), m.sole, 0, 0.115, -0.005);
    band.rotation.x = Math.PI / 2;
    const patch = put(foot, new THREE.CircleGeometry(0.02, 12), m.sole, s * 0.076, 0.06, -0.005);
    patch.rotation.y = s * Math.PI / 2;
  }
}

/** Scarf, necklace, bow tie, tie, pearls, choker, bandana, flower lei or a medal. */
export function buildNeckwear(a) {
  const { look, mats: m, body } = a;
  const front = a.front;
  const kind = look.neck;
  if (kind === 'scarf') {
    put(body, new THREE.TorusGeometry(0.12, 0.05, 10, 20), m.extra, 0, 0.775, 0).rotation.x = Math.PI / 2;
    const end = put(body, capsule(0.04, 0.12, 3, 10), m.extra, 0.08, 0.68, 0.15);
    end.scale.z = 0.6;
    put(body, new THREE.BoxGeometry(0.07, 0.025, 0.02), shadeMat(look.extraColor, 0.8), 0.08, 0.6, 0.15); // fringe
  } else if (kind === 'necklace') {
    for (const p of necklace(a, 30, 0.08)) put(body, sphere(0.005, 6, 4), m.gold, p.x, p.y, p.z);
    put(body, new THREE.ShapeGeometry(heartShape(0.05), 8).center(), m.gold, 0, 0.69, front + 0.004);
  } else if (kind === 'bowtie') {
    for (const s of [-1, 1]) put(body, new THREE.ConeGeometry(0.04, 0.07, 4), m.extra, s * 0.038, 0.735, front - 0.01).rotation.z = (s * Math.PI) / 2;
    put(body, sphere(0.018, 10, 8), m.extra, 0, 0.735, front - 0.005);
  } else if (kind === 'tie') {
    put(body, sphere(0.022, 10, 8), m.extra, 0, 0.735, front - 0.012);
    const blade = put(body, new THREE.ConeGeometry(0.04, 0.25, 4), m.extra, 0, 0.6, front + 0.004);
    blade.rotation.set(0, Math.PI / 4, Math.PI);
    blade.scale.z = 0.25;
  } else if (kind === 'pearls') {
    const pearl = new THREE.MeshPhongMaterial({ color: '#fbf6ee', shininess: 100, specular: '#ffffff' });
    for (const p of necklace(a, 22, 0.075)) put(body, sphere(0.014, 10, 8), pearl, p.x, p.y, p.z);
  } else if (kind === 'choker') {
    // A locket: a ribbon round the neck with a heart that opens… (it doesn't).
    for (const p of necklace(a, 34, 0.11)) put(body, sphere(0.006, 6, 4), m.dark, p.x, p.y, p.z);
    const locket = put(
      body,
      new THREE.ExtrudeGeometry(heartShape(0.065), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }).center(),
      m.gold, 0, 0.655, front + 0.01,
    );
    put(locket, sphere(0.007, 8, 6), new THREE.MeshPhongMaterial({ color: '#ff5c8a', shininess: 120 }), 0, 0.004, 0.009);
  } else if (kind === 'bandana') {
    const knot = put(body, new THREE.TorusGeometry(0.075, 0.018, 6, 20), m.extra, 0, 0.77, 0);
    knot.rotation.x = Math.PI / 2;
    const cloth = put(body, new THREE.ConeGeometry(0.1, 0.13, 3), m.extra, 0, 0.7, front - 0.01);
    cloth.rotation.set(0, 0, Math.PI);
    cloth.scale.z = 0.3;
    for (const [x, y] of [[-0.03, 0.72], [0.035, 0.69], [0, 0.66]]) put(body, sphere(0.008, 6, 4), m.cloth, x, y, front + 0.012);
  } else if (kind === 'lei') {
    const colours = ['#ff6f91', '#fff3c4', '#ffffff', '#ff9eb5', '#f2b84b'].map((c) => mat(c));
    necklace(a, 18, 0.1, 0.015).forEach((p, i) => put(body, new THREE.IcosahedronGeometry(0.032, 1), colours[i % colours.length], p.x, p.y, p.z));
  } else if (kind === 'medal') {
    for (const s of [-1, 1]) {
      const ribbon = put(body, new THREE.BoxGeometry(0.03, 0.15, 0.01), m.extra, s * 0.035, 0.68, front - 0.005);
      ribbon.rotation.z = s * 0.35;
    }
    const disc = put(body, new THREE.CylinderGeometry(0.038, 0.038, 0.01, 20), m.gold, 0, 0.6, front + 0.012);
    disc.rotation.x = Math.PI / 2;
    put(body, new THREE.ShapeGeometry(starShape(0.045)), basic('#fff3c0'), 0, 0.6, front + 0.018);
  }
}
const shadeMat = (hex, k) => mat(shade(hex, k));

/** `n` points of a necklace lying on the shoulders and chest, hanging `drop` lower in front. */
function necklace(a, n, drop, lift = 0.008) {
  const { x: sx, z: sz } = a.torso.scale;
  const points = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const front = Math.max(0, Math.sin(t));
    const y = 0.775 - drop * front * front;
    const r = (y > 0.665 ? Math.sqrt(Math.max(0, 0.19 ** 2 - (y - 0.665) ** 2)) : 0.19) + lift;
    points.push(new THREE.Vector3(Math.cos(t) * r * sx, y, Math.sin(t) * r * sz));
  }
  return points;
}

/** Backpack, angel / fairy / bat wings, a cape or a guitar. */
export function buildBack(a) {
  const { look, mats: m, body } = a;
  const back = -0.16 * a.depth;
  const kind = look.back;
  if (kind === 'backpack') {
    const pack = put(body, capsule(0.12, 0.08, 4, 12), m.extra, 0, 0.57, back - 0.07);
    pack.scale.set(1.15, 1, 0.6);
    const pocket = put(body, capsule(0.07, 0.03, 3, 10), shadeMat(look.extraColor, 0.85), 0, 0.5, back - 0.135);
    pocket.scale.set(1.3, 1, 0.4);
    for (const s of [-1, 1]) {
      const strap = put(body, new THREE.TorusGeometry(0.15, 0.012, 6, 20, Math.PI), shadeMat(look.extraColor, 0.8), s * 0.1, 0.6, 0);
      strap.rotation.y = -Math.PI / 2;
      strap.scale.set(1.1 * a.depth, 1.6, 1);
    }
  } else if (kind === 'wings' || kind === 'fairy' || kind === 'bat') {
    const list = [-1, 1].map((s) => {
      const wing = new THREE.Group();
      wing.position.set(s * 0.06, 0.66, back - 0.01);
      if (kind === 'wings') {
        const feather = mat('#fdfbf7');
        for (const [x, y, size] of [[0.14, 0.06, 1], [0.2, -0.04, 0.8], [0.24, -0.12, 0.6], [0.1, -0.06, 0.7]]) {
          const plume = put(wing, sphere(0.1 * size, 16, 10), feather, s * x, y, -0.02);
          plume.scale.set(1.4, 0.75, 0.25);
          plume.rotation.z = s * 0.4;
        }
      } else if (kind === 'fairy') {
        const glass = new THREE.MeshPhongMaterial({ color: '#d9ecff', emissive: '#8fb8ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.55, side: THREE.DoubleSide, shininess: 120, depthWrite: false });
        for (const [x, y, w, h, r] of [[0.16, 0.1, 0.13, 0.08, 0.5], [0.12, -0.08, 0.08, 0.05, -0.4]]) {
          const blade = put(wing, new THREE.CircleGeometry(1, 24), glass, s * x, y, -0.02);
          blade.scale.set(w, h, 1);
          blade.rotation.set(0, s * 0.3, s * r);
        }
      } else {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.04);
        shape.lineTo(0.32, 0.12);
        shape.quadraticCurveTo(0.27, 0.02, 0.3, -0.06);
        shape.quadraticCurveTo(0.22, -0.02, 0.19, -0.1);
        shape.quadraticCurveTo(0.12, -0.04, 0.07, -0.1);
        shape.quadraticCurveTo(0.05, -0.02, 0, -0.04);
        const blade = put(wing, new THREE.ShapeGeometry(shape, 6), mat('#3b2a4a', { side: THREE.DoubleSide }), 0, 0, -0.02);
        blade.scale.x = s;
      }
      body.add(wing);
      return wing;
    });
    a.wings = { list, flutter: kind === 'fairy' };
  } else if (kind === 'cape') {
    const cape = put(body, new THREE.CylinderGeometry(0.17, 0.3, 0.52, 22, 1, true, Math.PI * 0.6, Math.PI * 0.8), mat(look.extraColor, { side: THREE.DoubleSide }), 0, 0.5, -0.02);
    cape.scale.z = a.depth;
    const clasp = put(body, new THREE.TorusGeometry(0.11, 0.014, 6, 20, Math.PI), m.gold, 0, 0.765, 0);
    clasp.rotation.x = -Math.PI / 2;
  } else if (kind === 'guitar') {
    const g = new THREE.Group();
    g.position.set(0, 0.5, back - 0.06);
    g.rotation.z = -0.55;
    const wood = mat('#c27a3a');
    for (const [y, r] of [[-0.06, 0.1], [0.06, 0.08]]) put(g, new THREE.CylinderGeometry(r, r, 0.045, 22), wood, 0, y, 0).rotation.x = Math.PI / 2;
    put(g, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 14), m.dark, 0, -0.01, -0.005).rotation.x = Math.PI / 2;
    put(g, new THREE.BoxGeometry(0.035, 0.32, 0.02), mat('#6b4423'), 0, 0.29, 0);
    put(g, new THREE.BoxGeometry(0.05, 0.07, 0.025), mat('#4a2e18'), 0, 0.47, 0);
    body.add(g);
    const sash = put(body, new THREE.TorusGeometry(0.2, 0.012, 6, 30), m.extra, 0, 0.58, 0);
    sash.rotation.set(Math.PI / 2, 0, 0.6, 'ZYX'); // laid round the body, then tilted across the chest
    sash.scale.set(1.04 * a.build, 0.86 * a.depth, 1);
  }
}

/** A tail at the back of the hips; it sways (avatar.js). */
export function buildTail(a) {
  const { look, body } = a;
  if (look.tail === 'none') return;
  const tail = new THREE.Group();
  tail.position.set(0, 0.38, -0.16 * a.depth);
  if (look.tail === 'bunny') {
    put(tail, new THREE.IcosahedronGeometry(0.06, 2), mat('#fbf8f4'), 0, 0, -0.03);
  } else if (look.tail === 'fox') {
    const orange = mat('#e07a3a');
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      put(tail, sphere(0.04 + Math.sin(t * Math.PI) * 0.045, 14, 10), i === 5 ? mat('#fbf8f4') : orange, 0, 0.02 + t * 0.2, -0.04 - t * 0.17);
    }
  } else {
    const devil = look.tail === 'devil';
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, -0.04, -0.12], [0, 0.06, -0.24], [0.04, 0.22, -0.28], [0.02, 0.32, -0.22]].map((p) => new THREE.Vector3(...p)));
    const material = devil ? mat('#c0392b') : a.mats.hair;
    put(tail, new THREE.TubeGeometry(curve, 24, devil ? 0.012 : 0.026, 8), material);
    const end = curve.getPoint(1);
    if (devil) {
      const tip = put(tail, new THREE.ConeGeometry(0.04, 0.07, 4), material, end.x, end.y + 0.02, end.z);
      tip.scale.z = 0.4;
    } else put(tail, sphere(0.027, 10, 8), material, end.x, end.y, end.z);
  }
  body.add(tail);
  a.tail = tail;
}

// ── Head ─────────────────────────────────────────────────────────────────

export function buildEars(a) {
  const { look, mats: m, head } = a;
  for (const s of [-1, 1]) {
    if (look.earShape === 'pointy') {
      const ear = put(head, new THREE.ConeGeometry(0.05, 0.17, 12), m.skin, s * 0.31, 0.02, -0.02);
      aim(ear, new THREE.Vector3(s * 0.75, 0.55, -0.35));
      ear.scale.set(1, 1, 0.45);
      continue;
    }
    const big = look.earShape === 'big' ? 1.45 : 1;
    const ear = put(head, sphere(0.055 * big, 14, 10), m.skin, s * (0.29 + (big - 1) * 0.03), -0.02, 0);
    ear.scale.set(0.45, 0.95, 0.75);
    const inner = put(ear, sphere(0.032 * big, 10, 8), m.skinDark, s * 0.012, 0, 0.01);
    inner.scale.set(0.5, 1, 0.8);
  }
}

export function buildNose(a) {
  const { look, mats: m, head } = a;
  if (look.nose === 'pointy') {
    const nose = put(head, new THREE.ConeGeometry(0.028, 0.08, 14), m.skinDark, 0, -0.035, 0.31);
    nose.rotation.x = Math.PI / 2 - 0.25;
    return;
  }
  const r = { button: 0.026, round: 0.037, tiny: 0.016 }[look.nose] ?? 0.026;
  const nose = put(head, sphere(r, 14, 10), m.skinDark, 0, -0.04, 0.3 - (r - 0.026) * 0.4);
  nose.scale.set(1.1, 0.8, 0.9);
}

/** Eyes, eyebrows, cheeks, mouth, freckles & co, and beards. */
export function buildFace(a) {
  const { look, mats: m, head } = a;
  const shape = look.eyeShape;
  const lid = (eye, width, tube) => {
    const line = put(eye, new THREE.TorusGeometry(0.05, tube, 6, 18, Math.PI * 0.78), m.dark, 0, 0, 0.012);
    line.rotation.z = Math.PI * 0.11;
    line.scale.set(0.95 * width, 1.12 * width, 1);
    return line;
  };
  a.eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(side * 0.105, 0, 0.268);
    const big = shape === 'anime' ? 1.2 : 1;
    const white = put(eye, sphere(0.052 * big, 22, 14), m.white);
    white.scale.set(0.95, 1.12, 0.4);
    const iris = put(eye, sphere(0.037 * big, 18, 12), m.iris, 0, shape === 'anime' ? -0.006 : 0, 0.012);
    iris.scale.set(1, 1.15, 0.45);
    const pupil = put(eye, sphere(0.02 * big, 12, 10), m.dark, 0, iris.position.y, 0.022);
    pupil.scale.set(1, 1.15, 0.45);
    const sparkle = put(eye, sphere(0.011 * big, 8, 6), m.white, 0.012 * big, 0.018 * big, 0.03);
    if (shape === 'round' || shape === 'sparkly') lid(eye, 1, 0.005);
    if (shape === 'lashes' || shape === 'anime' || shape === 'cat') {
      lid(eye, big, shape === 'cat' ? 0.006 : 0.008);
      const flick = put(eye, capsule(0.006, 0.022, 2, 6), m.dark, side * 0.047 * big, 0.04 * big, 0.012);
      flick.rotation.z = -side * 0.9;
    }
    if (shape === 'sparkly' || shape === 'anime') {
      iris.scale.multiplyScalar(1.1);
      sparkle.scale.setScalar(1.45);
      put(eye, sphere(0.007, 8, 6), m.white, -0.014, -0.018, 0.03);
    } else if (shape === 'sleepy') {
      // A heavy upper eyelid.
      const lidMesh = put(eye, new THREE.SphereGeometry(0.056, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), m.skin, 0, 0, 0.004);
      lidMesh.scale.set(0.98, 1.12, 0.48);
      lidMesh.rotation.x = 0.35;
      lid(eye, 1, 0.005).position.y = -0.012;
    } else if (shape === 'happy') {
      // Closed, smiling eyes: ^ ^
      for (const part of [white, iris, pupil, sparkle]) part.visible = false;
      put(eye, new THREE.TorusGeometry(0.036, 0.0095, 6, 14, Math.PI), m.dark, 0, -0.012, 0.012);
    } else if (shape === 'dots') {
      for (const part of [white, iris]) part.visible = false;
      pupil.scale.set(1.35, 1.75, 0.45);
      sparkle.position.set(0.008, 0.016, 0.03);
      sparkle.scale.setScalar(0.8);
    } else if (shape === 'hearts') {
      iris.visible = pupil.visible = false;
      put(eye, new THREE.ShapeGeometry(heartShape(0.07), 10).center(), new THREE.MeshBasicMaterial({ color: look.eyes === '#2a1f1d' ? '#e23a5c' : look.eyes }), 0, -0.004, 0.023);
      lid(eye, 1, 0.005);
    } else if (shape === 'cat') {
      iris.scale.multiplyScalar(1.12);
      pupil.scale.set(0.35, 1.9, 0.45);
    }
    head.add(eye);
    return eye;
  });

  // Eyebrows (they move with the mood: avatar.js turns and lifts the groups).
  a.browY = 0.09 + (shape === 'anime' ? 0.012 : 0);
  a.brows = [-1, 1].map((side) => {
    const brow = new THREE.Group();
    brow.position.set(side * 0.105, a.browY, 0.272);
    const style = look.brows;
    if (style === 'arched') {
      const arc = put(brow, new THREE.TorusGeometry(0.042, 0.0085, 6, 14, Math.PI * 0.65), a.mats.hair, 0, -0.034, 0);
      arc.rotation.z = Math.PI * 0.175;
    } else {
      const [r, l] = { thick: [0.016, 0.056], thin: [0.0065, 0.05], angled: [0.014, 0.052] }[style] ?? [0.011, 0.05];
      const bar = put(brow, capsule(r, l, 3, 8), a.mats.hair);
      bar.rotation.z = Math.PI / 2 + (style === 'angled' ? side * 0.28 : 0);
    }
    brow.visible = style !== 'none';
    head.add(brow);
    return brow;
  });

  // Rosy cheeks (they glow brighter when blushing).
  a.blushBase = look.cheeks === 'none' ? 0 : 0.5; // they still glow when blushing
  a.blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: a.blushBase, depthWrite: false });
  a.cheeks = [-1, 1].map((side) => {
    const geo = look.cheeks === 'hearts' ? new THREE.ShapeGeometry(heartShape(0.075), 8).center()
      : look.cheeks === 'stars' ? new THREE.ShapeGeometry(starShape(0.085)).center()
        : new THREE.CircleGeometry(0.045, 16);
    const blush = new THREE.Mesh(geo, a.blushMat);
    blush.position.set(side * 0.18, -0.075, 0.236);
    blush.rotation.y = side * 0.65;
    head.add(blush);
    return blush;
  });

  // Mouth: at rest (one of several), wide open with teeth (laughing, yawning…) and a kiss.
  const lips = look.lips !== 'none' ? basic(look.lips) : null;
  const line = lips ?? m.dark;
  const tube = lips ? 0.011 : 0.008;
  a.smile = new THREE.Group();
  a.smile.position.set(0, -0.095, 0.284);
  const arc = (r, length = Math.PI) => {
    const mesh = put(a.smile, new THREE.TorusGeometry(r, tube, 6, 16, length), line);
    mesh.rotation.z = Math.PI + (Math.PI - length) / 2;
    return mesh;
  };
  const mouth = look.mouth;
  if (mouth === 'grin') {
    put(a.smile, new THREE.CircleGeometry(0.04, 18, Math.PI, Math.PI), m.mouth, 0, 0.006, 0);
    put(a.smile, new THREE.PlaneGeometry(0.066, 0.012), m.white, 0, -0.0, 0.001);
    if (lips) arc(0.041).position.y = 0.006;
  } else if (mouth === 'cat') {
    for (const s of [-1, 1]) arc(0.016).position.x = s * 0.016;
  } else if (mouth === 'oh') {
    const o = put(a.smile, new THREE.CircleGeometry(0.017, 16), m.mouth, 0, -0.01, 0);
    o.scale.y = 1.25;
    if (lips) put(a.smile, new THREE.TorusGeometry(0.019, 0.007, 6, 18), lips, 0, -0.01, 0.001).scale.y = 1.25;
  } else if (mouth === 'smirk') {
    const s = arc(0.027, Math.PI * 0.8);
    s.rotation.z += 0.32;
    s.position.x = 0.012;
  } else {
    arc(mouth === 'small' ? 0.02 : 0.033);
    if (mouth === 'tongue') put(a.smile, new THREE.CircleGeometry(0.015, 14, Math.PI, Math.PI), basic('#ef6f86'), 0.006, -0.031, 0.002);
    if (mouth === 'fangs') {
      for (const s of [-1, 1]) put(a.smile, new THREE.ConeGeometry(0.0065, 0.018, 6), m.white, s * 0.016, -0.037, 0.003).rotation.z = Math.PI;
    }
  }
  a.openMouth = new THREE.Group();
  a.openMouth.position.set(0, -0.11, 0.287);
  put(a.openMouth, new THREE.CircleGeometry(0.042, 18), m.mouth);
  put(a.openMouth, new THREE.PlaneGeometry(0.05, 0.014), m.white, 0, 0.024, 0.002);
  put(a.openMouth, new THREE.CircleGeometry(0.02, 12), basic('#e0707e'), 0, -0.02, 0.002);
  a.kiss = put(head, new THREE.TorusGeometry(0.017, 0.009, 8, 14), lips ?? basic('#d4506a'), 0, -0.1, 0.29);
  head.add(a.smile, a.openMouth);

  buildMarks(a);
  buildBeard(a);
}

function buildMarks(a) {
  const { look, head } = a;
  const kind = look.marks;
  if (kind === 'freckles') {
    const brown = basic('#b0714d');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) onFace(a, new THREE.Mesh(new THREE.CircleGeometry(0.0065, 8), brown), s * (0.13 + (i % 3) * 0.022), -0.035 - Math.floor(i / 3) * 0.024 - (i % 2) * 0.006);
    }
  } else if (kind === 'mole') {
    onFace(a, new THREE.Mesh(new THREE.CircleGeometry(0.009, 10), basic('#4a2c22')), 0.072, -0.125);
  } else if (kind === 'bandaid') {
    const plaster = onFace(a, new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.027), mat('#ecc9a2')), -0.15, -0.02, 0.006);
    plaster.rotateZ(0.5);
    put(plaster, new THREE.PlaneGeometry(0.026, 0.02), mat('#d9a982'), 0, 0, 0.001);
  } else if (kind === 'heart') {
    onFace(a, new THREE.Mesh(new THREE.ShapeGeometry(heartShape(0.045), 8).center(), basic('#e23a5c')), -0.165, -0.075, 0.005);
  } else if (kind === 'glitter') {
    const gold = basic('#ffd46b');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const star = onFace(a, new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.024 - (i % 2) * 0.007)), gold), s * (0.085 + i * 0.022), -0.058 - (i % 2) * 0.016, 0.005);
        star.rotateZ(i * 0.5);
      }
    }
  }
}

function buildBeard(a) {
  const { look, mats: m, head } = a;
  const kind = look.beard;
  if (kind === 'stubble' || kind === 'beard') {
    // The lower front of a slightly larger sphere = a beard around the jaw.
    const full = kind === 'beard';
    head.add(new THREE.Mesh(
      new THREE.SphereGeometry(full ? 0.31 : 0.303, 22, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.58, Math.PI * 0.32),
      full ? m.hair : basic(look.hair, { transparent: true, opacity: 0.35 }),
    ));
  }
  if (kind === 'goatee') {
    const chin = put(head, sphere(0.045, 14, 10), m.hair, 0, -0.205, 0.215);
    chin.scale.set(1, 1.2, 0.6);
  }
  if (kind === 'mustache' || kind === 'beard' || kind === 'goatee') {
    const thin = kind === 'goatee' ? 0.75 : 1;
    for (const s of [-1, 1]) {
      const half = put(head, capsule(0.016 * thin, 0.04, 3, 8), m.hair, s * 0.03, -0.068, 0.293);
      half.rotation.z = s * 1.2;
    }
  } else if (kind === 'handlebar') {
    // A bar under the nose with its ends curled up.
    for (const s of [-1, 1]) {
      const bar = put(head, capsule(0.013, 0.04, 3, 8), m.hair, s * 0.032, -0.072, 0.29);
      bar.rotation.z = s * 1.4;
      const curl = put(head, new THREE.TorusGeometry(0.014, 0.0065, 6, 12, Math.PI * 1.4), m.hair, s * 0.066, -0.061, 0.28);
      curl.rotation.z = -Math.PI / 2;
      curl.scale.x = s;
    }
  }
}

/** Hairstyles. Highlights (`dye`) colour a streak and the ends of long styles. */
export function buildHair(a) {
  const { look, head } = a;
  const style = look.hairStyle;
  if (style === 'bald') return;
  const hair = a.mats.hair;
  const dye = look.dye !== 'none' ? mat(look.dye) : null;
  const tips = dye ?? hair;
  const add = (geo, x, y, z, material = hair) => put(head, geo, material, x, y, z);
  const fringe = (side) => {
    const f = add(sphere(0.16, 18, 10), side ? 0.09 : 0.05, 0.19, 0.2);
    f.scale.set(side ? 1.9 : 1.6, 0.55, 0.8);
    f.rotation.z = side ? -0.45 : -0.25;
    // A couple of locks for a less helmet-like look.
    for (const x of side ? [-0.17] : [-0.15, 0.17]) {
      const lock = add(new THREE.ConeGeometry(0.045, 0.12, 10), x, 0.12, 0.22);
      lock.rotation.set(0.3, 0, Math.PI + x * 1.2);
    }
  };
  const short = ['buzz', 'mohawk', 'quiff', 'topknot'].includes(style);
  const cap = add(new THREE.SphereGeometry(short ? 0.307 : 0.318, 30, 16, 0, Math.PI * 2, 0, Math.PI * (short ? 0.5 : 0.56)), 0, 0.02, -0.02);
  cap.rotation.x = -0.42;
  if (dye && !['afro', 'curly', 'buzz'].includes(style)) {
    // A coloured lock: in the fringe, or over the top for styles without one.
    const fringed = !short && !['spiky', 'dreads'].includes(style);
    const streak = fringed ? add(capsule(0.024, 0.11, 3, 8), 0.1, 0.2, 0.316, dye) : add(capsule(0.026, 0.14, 3, 8), 0.1, 0.28, 0.14, dye);
    if (fringed) streak.rotation.set(0, 0, 1.2);
    else streak.rotation.set(1.0, 0, -0.3);
    streak.scale.z = 0.55;
  }

  if (style === 'mohawk') {
    // A ridge of spikes from the forehead to the back.
    for (let i = 0; i < 6; i++) {
      const t = -0.35 + i * 0.32; // angle over the top, front → back
      const spike = add(new THREE.ConeGeometry(0.055, 0.17 - Math.abs(i - 2) * 0.012, 8), 0, Math.cos(t) * 0.33, Math.sin(-t) * 0.33, i % 2 ? tips : hair);
      spike.rotation.x = -t;
    }
  } else if (style === 'quiff') {
    // Swept up and forward from the forehead.
    const swoop = add(sphere(0.16, 22, 14), 0, 0.26, 0.15);
    swoop.scale.set(1.15, 0.6, 1.05);
    swoop.rotation.x = -0.7;
    const crest = add(sphere(0.1, 18, 12), 0.02, 0.33, 0.25, tips);
    crest.scale.set(1.35, 0.55, 0.9);
    crest.rotation.x = -0.85;
  } else if (style === 'topknot') {
    add(new THREE.IcosahedronGeometry(0.085, 2), 0, 0.36, -0.06, tips);
    const tie = add(new THREE.TorusGeometry(0.05, 0.014, 6, 14), 0, 0.3, -0.05, a.mats.dark);
    tie.rotation.x = Math.PI / 2 + 0.3;
  } else if (style === 'afro') {
    add(new THREE.IcosahedronGeometry(0.4, 3), 0, 0.2, -0.12);
    for (const x of [-0.27, 0.27]) add(new THREE.IcosahedronGeometry(0.12, 2), x, 0.02, 0.03);
  } else if (style === 'spiky') {
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2;
      const tilt = 0.75;
      const spike = add(new THREE.ConeGeometry(0.07, 0.2, 8), Math.sin(t) * Math.sin(tilt) * 0.27, 0.2 + Math.cos(tilt) * 0.1, Math.cos(t) * Math.sin(tilt) * 0.27 - 0.04, i % 3 ? hair : tips);
      spike.lookAt(spike.position.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.3, 0)));
      spike.rotateX(Math.PI / 2);
    }
    add(new THREE.ConeGeometry(0.08, 0.22, 8), 0, 0.38, -0.03, tips);
  } else if (style === 'curly') {
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2 * 3;
      const ring = i % 3;
      const r = 0.28 - ring * 0.08;
      add(new THREE.IcosahedronGeometry(0.085 - ring * 0.012, 1), Math.cos(t) * r, 0.1 + ring * 0.11, Math.sin(t) * r - 0.04, dye && i % 5 === 0 ? dye : hair);
    }
  } else if (style === 'curtains') {
    for (const s of [-1, 1]) {
      const half = add(sphere(0.14, 18, 10), s * 0.11, 0.17, 0.2);
      half.scale.set(1.25, 0.55, 0.75);
      half.rotation.z = s * 0.55;
      const side = add(capsule(0.06, 0.12, 3, 10), s * 0.26, 0.0, 0.09, tips);
      side.rotation.z = s * 0.15;
      side.scale.z = 0.7;
    }
  } else if (style === 'pixie') {
    fringe(true);
    for (const x of [-0.12, 0, 0.12]) {
      const tuft = add(new THREE.ConeGeometry(0.05, 0.12, 8), x, -0.08, -0.25, tips);
      tuft.rotation.x = Math.PI - 0.5;
    }
  } else if (style === 'dreads') {
    for (let i = 0; i < 15; i++) {
      const t = -1.9 + (i / 14) * 3.8; // around the back, ear to ear
      const len = 0.18 + (i % 3) * 0.05;
      const x = Math.sin(t) * 0.28;
      const z = -Math.cos(t) * 0.28 - 0.02;
      add(capsule(0.03, len, 3, 8), x, -0.02 - len / 2, z);
      add(sphere(0.034, 10, 8), x, -0.04 - len, z, tips);
    }
  }

  if (!['curly', 'spiky', 'afro', 'mohawk', 'quiff', 'topknot', 'buzz', 'curtains', 'pixie', 'dreads'].includes(style)) fringe(style === 'side' || style === 'sidepony');
  if (style === 'short' && look.hat === 'none') {
    const curl = add(new THREE.TorusGeometry(0.06, 0.022, 8, 14, Math.PI * 1.5), 0, 0.36, -0.02);
    curl.rotation.set(0, Math.PI / 2, 0.6);
  } else if (style === 'braids') {
    const back = add(capsule(0.25, 0.06, 6, 16), 0, -0.06, -0.14);
    back.scale.set(1.12, 1, 0.62);
    const tie = mat('#f4f1ec');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) add(new THREE.IcosahedronGeometry(0.052 - i * 0.003, 1), s * (0.26 + i * 0.006), -0.08 - i * 0.075, -0.02 - i * 0.012, i > 3 ? tips : hair);
      add(sphere(0.026, 10, 8), s * 0.3, -0.5, -0.09, tie);
    }
  } else if (style === 'long' || style === 'bob' || style === 'wavy') {
    const long = style !== 'bob';
    const back = add(capsule(0.25, long ? 0.3 : 0.08, 6, 16), 0, long ? -0.2 : -0.08, -0.14);
    back.scale.set(1.12, 1, 0.62);
    for (const s of [-1, 1]) add(capsule(0.075, long ? 0.26 : 0.12, 4, 12), s * 0.25, long ? -0.2 : -0.1, 0.04);
    if (style === 'wavy') {
      // Soft waves down the sides and curls at the ends.
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) add(sphere(0.062, 14, 10), s * (0.27 + (i % 2) * 0.03), -0.08 - i * 0.085, 0.05, i > 1 ? tips : hair);
      }
      for (let i = 0; i < 5; i++) add(sphere(0.075, 14, 10), -0.2 + i * 0.1, -0.45, -0.15 - Math.abs(i - 2) * 0.01, tips);
    } else if (dye && long) {
      const ends = add(capsule(0.24, 0.02, 6, 16), 0, -0.42, -0.14, dye);
      ends.scale.set(1.12, 0.6, 0.6);
      for (const s of [-1, 1]) add(sphere(0.074, 14, 10), s * 0.25, -0.36, 0.04, dye);
    }
  } else if (style === 'ponytail') {
    add(new THREE.TorusGeometry(0.035, 0.015, 6, 12), 0, 0.12, -0.3, a.mats.gold);
    const tail = add(capsule(0.08, 0.26, 4, 12), 0, -0.04, -0.36);
    tail.rotation.x = 0.35;
    add(sphere(0.075, 14, 10), 0, -0.2, -0.42, tips).scale.set(1, 1.2, 1);
  } else if (style === 'sidepony') {
    add(new THREE.TorusGeometry(0.035, 0.015, 6, 12), 0.25, 0.0, -0.18, a.mats.gold).rotation.y = Math.PI / 2;
    const tail = add(capsule(0.075, 0.24, 4, 12), 0.31, -0.18, -0.08);
    tail.rotation.set(-0.15, 0, 0.18);
    add(sphere(0.07, 14, 10), 0.335, -0.36, -0.06, tips).scale.set(1, 1.2, 1);
  } else if (style === 'pigtails') {
    const tie = mat('#e8737f');
    for (const s of [-1, 1]) {
      const tail = add(capsule(0.07, 0.2, 4, 12), s * 0.33, -0.05, -0.06);
      tail.rotation.z = s * 0.4;
      add(sphere(0.06, 14, 10), s * 0.39, -0.18, -0.06, tips);
      add(sphere(0.035, 10, 8), s * 0.29, 0.07, -0.06, tie);
    }
  } else if (style === 'bun') {
    add(new THREE.IcosahedronGeometry(0.13, 2), 0, 0.33, -0.1, tips);
  } else if (style === 'spacebuns') {
    for (const s of [-1, 1]) {
      add(new THREE.IcosahedronGeometry(0.1, 2), s * 0.2, 0.3, -0.05, tips);
      add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), s * 0.19, 0.25, -0.04, mat('#ff9eb5')).rotation.set(Math.PI / 2, 0, s * 0.6);
    }
  }
}

/** Hats (and hair accessories) sit on the head, tilted back a little. */
export function buildHat(a) {
  const { look, mats: m } = a;
  const hat = look.hat;
  if (hat === 'none') return;
  const g = new THREE.Group();
  g.position.set(0, 0.06, -0.02);
  g.rotation.x = -0.25;
  const colour = m.hat;
  const dark = shadeMat(look.hatColor, 0.75);
  const add = (geo, material, x, y, z) => put(g, geo, material, x, y, z);
  if (hat === 'beanie' || hat === 'cap') {
    add(new THREE.SphereGeometry(0.33, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), colour);
    if (hat === 'beanie') {
      add(new THREE.TorusGeometry(0.325, 0.04, 10, 28), dark).rotation.x = Math.PI / 2;
      add(new THREE.IcosahedronGeometry(0.07, 2), mat('#f4f1ec'), 0, 0.34, 0);
    } else {
      const visor = add(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), colour, 0, 0, 0.22);
      visor.scale.set(1, 1, 0.9);
      add(sphere(0.025, 10, 8), dark, 0, 0.33, 0);
    }
  } else if (hat === 'beret') {
    const top = add(sphere(0.3, 24, 12), colour, 0.04, 0.27, 0);
    top.scale.set(1.08, 0.32, 1.08);
    top.rotation.z = -0.22;
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), colour, 0.03, 0.37, 0);
  } else if (hat === 'sunhat') {
    add(new THREE.CylinderGeometry(0.22, 0.27, 0.16, 24), colour, 0, 0.29, 0);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.016, 36), colour, 0, 0.21, 0);
    add(new THREE.CylinderGeometry(0.272, 0.272, 0.045, 24, 1, true), mat('#f4f1ec'), 0, 0.24, 0);
    add(new THREE.IcosahedronGeometry(0.04, 1), mat('#ff9eb5'), 0.2, 0.26, 0.15);
  } else if (hat === 'bunny' || hat === 'cat' || hat === 'bear') {
    const inner = mat('#ffb3c6');
    for (const s of [-1, 1]) {
      if (hat === 'bear') {
        const ear = add(sphere(0.075, 16, 10), colour, s * 0.2, 0.29, 0);
        ear.scale.z = 0.6;
        put(ear, new THREE.CircleGeometry(0.042, 14), inner, 0, -0.005, 0.076);
        continue;
      }
      const bunny = hat === 'bunny';
      const ear = add(bunny ? capsule(0.05, 0.22, 4, 12) : new THREE.ConeGeometry(0.075, 0.15, 4), colour, s * (bunny ? 0.11 : 0.17), bunny ? 0.45 : 0.32, 0);
      ear.rotation.z = -s * (bunny ? 0.2 : 0.35);
      ear.scale.z = bunny ? 0.5 : 1;
      const pink = put(ear, bunny ? capsule(0.026, 0.16, 3, 8) : new THREE.ConeGeometry(0.04, 0.09, 3), inner, 0, bunny ? 0 : -0.02, bunny ? 0.022 : 0.03);
      pink.scale.z = 0.4;
    }
    if (hat !== 'bear') add(new THREE.TorusGeometry(0.33, 0.014, 6, 24, Math.PI), colour, 0, 0.0, 0.03); // the headband holding them
  } else if (hat === 'bow') {
    for (const s of [-1, 1]) {
      const loop = add(new THREE.ConeGeometry(0.07, 0.13, 12), colour, 0.18 + s * 0.07, 0.26, 0.08);
      loop.rotation.z = (s * Math.PI) / 2;
    }
    add(sphere(0.035, 12, 8), dark, 0.18, 0.26, 0.08);
  } else if (hat === 'flowers') {
    const colours = ['#ff9eb5', '#fff3c4', '#ffffff', '#ffc0d0'].map((c) => mat(c));
    for (let i = 0; i < 11; i++) {
      const t = (i / 11) * Math.PI * 2;
      add(new THREE.IcosahedronGeometry(0.045, 1), colours[i % colours.length], Math.cos(t) * 0.29, 0.13, Math.sin(t) * 0.29);
    }
    for (let i = 0; i < 11; i += 2) {
      const t = ((i + 0.5) / 11) * Math.PI * 2;
      const leaf = add(sphere(0.03, 8, 6), mat('#7cc49a'), Math.cos(t) * 0.3, 0.12, Math.sin(t) * 0.3);
      leaf.scale.set(1.4, 0.5, 0.8);
    }
  } else if (hat === 'crown' || hat === 'tiara') {
    const tiara = hat === 'tiara';
    add(new THREE.CylinderGeometry(tiara ? 0.27 : 0.2, tiara ? 0.28 : 0.22, tiara ? 0.03 : 0.09, 28, 1, true, tiara ? -Math.PI * 0.35 : 0, tiara ? Math.PI * 0.7 : Math.PI * 2), m.gold, 0, tiara ? 0.17 : 0.3, 0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = tiara ? -Math.PI * 0.25 + (i / (n - 1)) * Math.PI * 0.5 : (i / n) * Math.PI * 2;
      const r = tiara ? 0.275 : 0.2;
      const tall = tiara ? (i === 2 ? 0.09 : 0.05) : 0.08;
      add(new THREE.ConeGeometry(tiara ? 0.022 : 0.035, tall, 6), m.gold, Math.sin(t) * r, (tiara ? 0.185 : 0.345) + tall / 2 - 0.005, Math.cos(t) * r); // on the band
    }
    const gem = add(new THREE.OctahedronGeometry(tiara ? 0.025 : 0.03), new THREE.MeshPhongMaterial({ color: '#ff5c8a', shininess: 120 }), 0, tiara ? 0.2 : 0.3, tiara ? 0.28 : 0.215);
    gem.scale.z = 0.6;
  } else if (hat === 'tophat') {
    add(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 32), colour, 0, 0.2, 0).scale.z = 0.9;
    add(new THREE.CylinderGeometry(0.22, 0.21, 0.34, 28), colour, 0, 0.37, 0);
    add(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 28, 1, true), m.dark, 0, 0.24, 0);
  } else if (hat === 'cowboy') {
    const brim = add(new THREE.LatheGeometry([[0.2, 0], [0.33, 0.005], [0.43, 0.035], [0.48, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)), 32), mat(look.hatColor, { side: THREE.DoubleSide }), 0, 0.18, 0);
    brim.scale.z = 0.85;
    const crown = add(sphere(0.24, 24, 14), colour, 0, 0.26, 0);
    crown.scale.set(1, 0.85, 0.92);
    add(new THREE.CylinderGeometry(0.235, 0.24, 0.045, 28, 1, true), dark, 0, 0.21, 0).scale.z = 0.92;
    const dent = add(sphere(0.1, 14, 8), dark, 0, 0.45, 0);
    dent.scale.set(1.2, 0.2, 0.5);
  } else if (hat === 'party') {
    const cone = add(new THREE.ConeGeometry(0.15, 0.38, 24), new THREE.MeshLambertMaterial({ map: printTexture('stripes', look.hatColor, '#fff4f2') }), 0.05, 0.42, 0);
    cone.rotation.z = -0.18;
    add(new THREE.IcosahedronGeometry(0.045, 2), mat('#fff4f2'), 0.085, 0.61, 0);
    add(new THREE.TorusGeometry(0.15, 0.02, 6, 20), mat('#fff4f2'), 0.03, 0.24, 0).rotation.set(Math.PI / 2, 0.18, 0);
  } else if (hat === 'halo') {
    const halo = add(new THREE.TorusGeometry(0.2, 0.024, 10, 36), basic('#ffe48a', { toneMapped: false }), 0, 0.46, 0);
    halo.rotation.x = Math.PI / 2;
  } else if (hat === 'headband') {
    const band = add(new THREE.TorusGeometry(0.33, 0.024, 8, 30, Math.PI), colour, 0, 0.0, 0.05);
    band.scale.set(1, 1.02, 1.5);
    for (const s of [-1, 1]) {
      const loop = add(new THREE.ConeGeometry(0.05, 0.09, 12), colour, -0.2 + s * 0.05, 0.25, 0.08);
      loop.rotation.z = (s * Math.PI) / 2;
    }
    add(sphere(0.025, 10, 8), dark, -0.2, 0.25, 0.08);
  } else if (hat === 'witch') {
    add(new THREE.CylinderGeometry(0.48, 0.48, 0.016, 36), colour, 0, 0.2, 0);
    add(new THREE.CylinderGeometry(0.11, 0.24, 0.3, 28), colour, 0, 0.36, 0);
    const tip = add(new THREE.ConeGeometry(0.11, 0.24, 24), colour, 0, 0.58, -0.05);
    tip.rotation.x = -0.55;
    add(new THREE.CylinderGeometry(0.235, 0.24, 0.05, 28, 1, true), mat('#9a6fd8'), 0, 0.24, 0);
    add(new THREE.BoxGeometry(0.06, 0.05, 0.01), m.gold, 0, 0.24, 0.24);
  } else if (hat === 'santa') {
    add(new THREE.CylinderGeometry(0.17, 0.3, 0.22, 28), colour, 0, 0.3, 0);
    const flop = add(new THREE.ConeGeometry(0.17, 0.3, 24), colour, 0.08, 0.47, -0.06);
    flop.rotation.set(-0.4, 0, -0.9);
    add(new THREE.IcosahedronGeometry(0.06, 2), mat('#fbf8f4'), 0.22, 0.5, -0.12);
    add(new THREE.TorusGeometry(0.3, 0.055, 10, 30), mat('#fbf8f4'), 0, 0.2, 0).rotation.x = Math.PI / 2;
  } else if (hat === 'bucket') {
    add(new THREE.CylinderGeometry(0.25, 0.3, 0.16, 28), colour, 0, 0.28, 0);
    add(new THREE.CylinderGeometry(0.31, 0.44, 0.09, 32, 1, true), mat(look.hatColor, { side: THREE.DoubleSide }), 0, 0.16, 0);
    add(new THREE.CylinderGeometry(0.302, 0.302, 0.035, 28, 1, true), dark, 0, 0.215, 0);
  } else if (hat === 'horns') {
    for (const s of [-1, 1]) {
      const horn = add(new THREE.ConeGeometry(0.045, 0.14, 12), colour, s * 0.15, 0.29, 0.06);
      horn.rotation.z = -s * 0.45;
    }
  } else if (hat === 'chef') {
    const white = mat('#fbf8f4');
    add(new THREE.CylinderGeometry(0.26, 0.28, 0.14, 28), white, 0, 0.23, 0);
    for (const [x, z, r] of [[0, 0, 0.19], [0.13, 0.06, 0.13], [-0.13, 0.06, 0.13], [0.1, -0.11, 0.13], [-0.1, -0.11, 0.13], [0, 0.13, 0.12]]) add(new THREE.IcosahedronGeometry(r, 2), white, x, 0.42, z);
    add(new THREE.CylinderGeometry(0.282, 0.282, 0.03, 28, 1, true), colour, 0, 0.18, 0);
  }
  a.head.add(g);
}

export function buildGlasses(a) {
  const { look, head } = a;
  const kind = look.glasses;
  if (kind === 'none') return;
  const g = new THREE.Group();
  g.position.set(0, 0.005, 0.292);
  const frame = { hearts: mat('#e23a5c'), stars: mat('#e0a800'), aviator: new THREE.MeshPhongMaterial({ color: '#d9b45a', shininess: 90 }), cateye: mat('#7a1f3d'), monocle: a.mats.gold }[kind] ?? mat('#222222');
  const tinted = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  for (const s of kind === 'monocle' ? [-1] : [-1, 1]) {
    const lens = new THREE.Group();
    lens.position.x = s * 0.105;
    if (kind === 'round' || kind === 'monocle') {
      put(lens, new THREE.TorusGeometry(0.058, kind === 'monocle' ? 0.007 : 0.009, 6, 24), frame);
      if (kind === 'monocle') put(lens, new THREE.CircleGeometry(0.056, 20), tinted('#cfe8ff', 0.35), 0, 0, -0.002);
    } else if (kind === 'square' || kind === 'nerd') {
      const ring = put(lens, new THREE.TorusGeometry(kind === 'nerd' ? 0.072 : 0.068, kind === 'nerd' ? 0.015 : 0.009, 4, 4), frame);
      ring.rotation.z = Math.PI / 4;
      ring.scale.y = 0.85;
    } else if (kind === 'stars') put(lens, new THREE.ShapeGeometry(starShape(0.075)), tinted('#ffcf3d', 0.9));
    else if (kind === 'sunglasses') put(lens, new THREE.CircleGeometry(0.064, 20), basic('#141414'));
    else if (kind === 'hearts') put(lens, new THREE.ShapeGeometry(heartShape(0.15), 10).center(), tinted('#e23a5c', 0.85));
    else if (kind === 'aviator') {
      const glass = put(lens, new THREE.CircleGeometry(0.062, 20), tinted('#5a3a1a', 0.75));
      glass.scale.set(1.05, 0.88, 1);
      glass.position.y = -0.008;
      const rim = put(lens, new THREE.TorusGeometry(0.062, 0.005, 6, 24), frame, 0, -0.008, 0.001);
      rim.scale.copy(glass.scale);
    } else if (kind === 'cateye') {
      put(lens, new THREE.TorusGeometry(0.058, 0.011, 6, 24), frame);
      const wing = put(lens, new THREE.ConeGeometry(0.022, 0.06, 4), frame, s * 0.06, 0.035, 0);
      wing.rotation.z = -s * 2.2;
      wing.scale.z = 0.4;
    }
    g.add(lens);
  }
  if (kind === 'monocle') {
    const chain = put(g, new THREE.CylinderGeometry(0.002, 0.002, 0.2, 4), a.mats.gold, -0.16, -0.14, -0.04);
    chain.rotation.z = 0.25;
  } else {
    put(g, new THREE.BoxGeometry(0.06, kind === 'nerd' ? 0.018 : 0.012, 0.01), frame); // bridge
    if (kind === 'aviator') put(g, new THREE.BoxGeometry(0.06, 0.006, 0.01), frame, 0, 0.045, 0);
  }
  head.add(g);
}

/** Earrings, hoops, pearls, headphones or earmuffs. */
export function buildEarwear(a) {
  const { look, mats: m, head } = a;
  const kind = look.ears;
  const x = 0.295 + (look.earShape === 'big' ? 0.02 : 0);
  if (kind === 'earrings') for (const s of [-1, 1]) put(head, sphere(0.022, 10, 8), m.gold, s * x, -0.085, 0.02);
  else if (kind === 'hoops') {
    for (const s of [-1, 1]) put(head, new THREE.TorusGeometry(0.032, 0.006, 6, 18), m.gold, s * x, -0.12, 0.02).rotation.y = Math.PI / 2;
  } else if (kind === 'pearls') {
    const pearl = new THREE.MeshPhongMaterial({ color: '#fbf6ee', shininess: 100, specular: '#ffffff' });
    for (const s of [-1, 1]) {
      put(head, sphere(0.008, 6, 4), m.gold, s * x, -0.085, 0.02);
      put(head, sphere(0.02, 12, 10), pearl, s * x, -0.115, 0.02);
    }
  } else if (kind === 'headphones' || kind === 'earmuffs') {
    const muffs = kind === 'earmuffs';
    put(head, new THREE.TorusGeometry(0.33, muffs ? 0.016 : 0.022, 8, 28, Math.PI), m.dark, 0, 0.02, muffs ? 0.02 : 0);
    for (const s of [-1, 1]) {
      if (muffs) {
        const muff = put(head, new THREE.IcosahedronGeometry(0.095, 3), m.extra, s * 0.31, 0, 0.0);
        muff.scale.set(0.6, 1, 1);
      } else {
        put(head, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), m.extra, s * 0.315, 0, 0).rotation.z = Math.PI / 2;
        put(head, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 18), m.dark, s * 0.35, 0, 0).rotation.z = Math.PI / 2;
      }
    }
  }
}

// ── Things to hold ───────────────────────────────────────────────────────

/**
 * Something in the left hand. Most things are carried in front (the left arm
 * holds them up; avatar.js); a teddy dangles, a balloon floats above.
 * In the hand's space, +x points up while carrying.
 */
export function buildHeld(a) {
  const { look, mats: m } = a;
  const kind = look.hold;
  if (kind === 'none') return;
  if (kind === 'balloon') {
    // A heart balloon on a string, tied to the left hand — it always floats upright.
    const group = new THREE.Group();
    put(group, new THREE.CylinderGeometry(0.003, 0.003, 0.8, 4), mat('#f4f1ec'), 0, 0.4, 0);
    put(
      group,
      new THREE.ExtrudeGeometry(heartShape(0.2), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 16 }).center(),
      new THREE.MeshPhongMaterial({ color: '#ff4d6d', shininess: 80, specular: '#ffd0da' }),
      0, 0.92, 0, // floats just above the head
    );
    a.root.add(group);
    a.balloon = group;
    a.held = { object: group, carry: false };
    return;
  }
  const g = new THREE.Group();
  g.position.set(0, -0.058, 0.03); // in the curled fingers
  const along = (geo) => {
    geo.rotateZ(-Math.PI / 2); // cylinders and cones: their length along +x
    return geo;
  };
  if (kind === 'teddy') {
    // Held by its paw, dangling.
    const fur = mat('#b07a4a');
    const light = mat('#e8c99b');
    const t = new THREE.Group();
    t.position.set(0, -0.06, 0);
    put(t, sphere(0.065, 16, 12), fur, 0, -0.13, 0).scale.set(1, 1.1, 0.9);
    put(t, sphere(0.055, 16, 12), fur, 0, -0.03, 0);
    put(t, sphere(0.024, 10, 8), light, 0.048, -0.04, 0);
    for (const s of [-1, 1]) {
      put(t, sphere(0.02, 10, 8), fur, 0, 0.012, s * 0.04);
      put(t, sphere(0.022, 10, 8), fur, 0.0, -0.2, s * 0.04);
      put(t, sphere(0.008, 6, 4), m.dark, 0.05, -0.015, s * 0.02);
    }
    put(t, sphere(0.008, 6, 4), m.dark, 0.072, -0.035, 0);
    put(t, capsule(0.018, 0.04, 2, 8), fur, 0, 0.02, 0.0).rotation.z = 0.3; // the paw being held
    g.add(t);
    a.held = { object: g, carry: false };
  } else {
    if (kind === 'rose') {
      put(g, along(new THREE.CylinderGeometry(0.005, 0.005, 0.26, 6)), mat('#3f7d3a'), 0.05, 0, 0);
      const red = mat('#d62b4b');
      put(g, sphere(0.03, 14, 10), red, 0.19, 0, 0).scale.set(1.2, 1, 1);
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        put(g, sphere(0.02, 10, 8), red, 0.175, Math.cos(t) * 0.025, Math.sin(t) * 0.025);
      }
      const leaf = put(g, sphere(0.02, 10, 6), mat('#4f9a48'), 0.07, 0.02, 0);
      leaf.scale.set(1.8, 0.5, 0.8);
    } else if (kind === 'icecream') {
      put(g, along(new THREE.ConeGeometry(0.036, 0.11, 16)).rotateZ(Math.PI), mat('#d9a066'), 0.035, 0, 0);
      put(g, sphere(0.04, 16, 12), mat('#ff9eb5'), 0.1, 0, 0);
      put(g, sphere(0.034, 16, 12), mat('#fff3d6'), 0.145, 0, 0);
      put(g, sphere(0.012, 8, 6), mat('#d62b4b'), 0.18, 0, 0);
    } else if (kind === 'coffee') {
      put(g, along(new THREE.CylinderGeometry(0.036, 0.03, 0.11, 18)), mat('#fbf8f4'), 0.03, 0, 0);
      put(g, along(new THREE.CylinderGeometry(0.038, 0.038, 0.015, 18)), mat('#6b4423'), 0.09, 0, 0);
      put(g, along(new THREE.CylinderGeometry(0.037, 0.034, 0.04, 18)), mat('#c49a6c'), 0.035, 0, 0);
    } else if (kind === 'lollipop') {
      put(g, along(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 6)), mat('#fbf8f4'), 0.04, 0, 0);
      const candy = put(g, new THREE.CylinderGeometry(0.055, 0.055, 0.016, 24), [mat('#ff6f91'), new THREE.MeshLambertMaterial({ map: swirlTexture() }), new THREE.MeshLambertMaterial({ map: swirlTexture() })], 0.16, 0, 0);
      candy.rotation.y = 0.2;
    } else if (kind === 'bouquet') {
      put(g, along(new THREE.ConeGeometry(0.065, 0.17, 18)).rotateZ(Math.PI), mat('#f6c3d5', { side: THREE.DoubleSide }), 0.06, 0, 0);
      const colours = ['#ff6f91', '#fff3c4', '#ffffff', '#d62b4b', '#b48be0'];
      [[0.16, 0, 0], [0.15, 0.035, 0.02], [0.15, -0.035, 0.02], [0.15, 0.01, -0.035], [0.14, -0.02, 0.04]].forEach(([x, y, z], i) => put(g, new THREE.IcosahedronGeometry(0.03, 1), mat(colours[i]), x, y, z));
      put(g, sphere(0.02, 8, 6), mat('#4f9a48'), 0.13, 0.05, -0.02).scale.set(1.6, 0.5, 0.8);
    } else if (kind === 'book') {
      put(g, new THREE.BoxGeometry(0.17, 0.12, 0.032), m.extra, 0.05, -0.03, 0);
      put(g, new THREE.BoxGeometry(0.16, 0.11, 0.034), mat('#fbf8f4'), 0.05, -0.034, 0);
    }
    a.held = { object: g, carry: true };
  }
  a.hands[1].add(g);
}

// ── Textures ─────────────────────────────────────────────────────────────

/** Fabric prints in the top's colour + the print colour (wrapped around the torso). */
const textures = new Map();
function printTexture(pattern, colour, accent) {
  const key = `${pattern}${colour}${accent}`;
  if (textures.has(key)) return textures.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = colour;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  g.strokeStyle = accent;
  let repeat = [4, 2];
  if (pattern === 'stripes') {
    for (let y = 8; y < 128; y += 32) g.fillRect(0, y, 128, 12);
    repeat = [1, 2];
  } else if (pattern === 'dots') {
    for (let y = 16; y < 128; y += 32) {
      for (let x = (y / 32) % 2 ? 0 : 16; x < 128 + 16; x += 32) {
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (pattern === 'checks') {
    g.globalAlpha = 0.45;
    for (let i = 0; i < 128; i += 32) {
      g.fillRect(i, 0, 14, 128);
      g.fillRect(0, i, 128, 14);
    }
    repeat = [3, 2];
  } else if (pattern === 'zigzag') {
    g.lineWidth = 7;
    for (let y = 20; y < 128; y += 42) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? 12 : 0));
      g.stroke();
    }
    repeat = [3, 2];
  } else if (pattern === 'flowers') {
    for (const [x, y] of [[32, 32], [96, 96], [96, 30], [30, 98]]) {
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(t) * 9, y + Math.sin(t) * 9, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f2b84b';
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = accent;
    }
    repeat = [3, 2];
  } else if (pattern === 'rainbow') {
    ['#e8737f', '#f2a35a', '#f2d36b', '#7cc49a', '#6f9fd8', '#b48be0'].forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, 44 + i * 7, 128, 7);
    });
    repeat = [1, 1];
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  textures.set(key, tex);
  return tex;
}

/** The jersey's number. */
function numberTexture(colour) {
  const key = `number${colour}`;
  if (textures.has(key)) return textures.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = colour;
  g.font = '800 104px Manrope, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('7', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, tex);
  return tex;
}

/** A pink-and-white lollipop swirl. */
function swirlTexture() {
  if (textures.has('swirl')) return textures.get('swirl');
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff4f2';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ff5c8a';
  g.lineWidth = 5;
  g.beginPath();
  for (let t = 0; t < Math.PI * 8; t += 0.1) g.lineTo(32 + Math.cos(t) * t * 1.2, 32 + Math.sin(t) * t * 1.2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set('swirl', tex);
  return tex;
}
