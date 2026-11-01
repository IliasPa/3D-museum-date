/**
 * Seasonal decorations (chosen per museum in /admin → Preview → start dot):
 * string lights along the top of the walls, things drifting down (snow,
 * leaves, petals), and a few props — pumpkins and bats for Halloween, a tree
 * with presents for Christmas, a snowman, heart balloons, flowers and
 * butterflies, sunflowers, piles of leaves. All simple shapes, few draw
 * calls, nothing to download.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_HEIGHT as H } from './layout.js';
import { heartShape } from './finale.js';
import { seededRandom } from './textures.js';

const THEMES = {
  halloween: { lights: ['#ff8a1c', '#9b5de5', '#ffb347'], falling: null, props: ['pumpkins', 'bats', 'cobwebs', 'ghosts'] },
  christmas: { lights: ['#ff4d4d', '#3ddc84', '#ffd166', '#4dabf7', '#ffffff'], falling: { emoji: ['❄️'], count: 26, speed: 0.35 }, props: ['tree', 'garlands'] },
  winter: { lights: ['#e3f2ff', '#a5d8ff', '#ffffff'], falling: { emoji: ['❄️'], count: 34, speed: 0.4 }, props: ['snowman'] },
  valentine: { lights: ['#ff5c8a', '#ffb3c6', '#ff2e63'], falling: { emoji: ['🌹', '💗'], count: 18, speed: 0.3 }, props: ['balloons'] },
  spring: { lights: ['#ffd6e7', '#c3f0ca', '#fff3b0'], falling: { emoji: ['🌸'], count: 22, speed: 0.3 }, props: ['flowers', 'butterflies'] },
  summer: { lights: ['#ffd166', '#ffe8a3', '#ffb347'], falling: null, props: ['sunflowers', 'butterflies'] },
  autumn: { lights: ['#ffb347', '#e76f51', '#f4a261'], falling: { emoji: ['🍂', '🍁'], count: 26, speed: 0.45 }, props: ['leafPiles'] },
};

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glowing = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

function emojiTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.font = '76px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 48, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param plan       the floor plan (layout.js)
 * @param theme      'halloween' | 'christmas' | … (seasons.js) — anything else: nothing
 * @param colliders  the museum's collision boxes (props you could walk into are added)
 * @param opts { reducedMotion }
 * @returns { group, update(dt, camera) }
 */
export function buildDecorations(plan, theme, colliders, { reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'decorations';
  const def = THEMES[theme];
  const animate = [];
  if (!def) return { group, update() {} };
  const rooms = plan.rooms.filter((r) => !r.isFinale);
  const rand = seededRandom(7);
  const doorsOut = plan.doors.filter((d) => !d.curtain);

  // ── String lights along the top of every gallery wall ──
  {
    const bulbs = [];
    for (const room of rooms) {
      const corners = [[room.x0 + 0.06, room.z1 - 0.06], [room.x0 + 0.06, room.z0 + 0.06], [room.x1 - 0.06, room.z0 + 0.06], [room.x1 - 0.06, room.z1 - 0.06]]
        .map(([x, z]) => new THREE.Vector3(x, H - 0.25, z));
      for (let w = 0; w < 4; w++) {
        const a = corners[w];
        const b = corners[(w + 1) % 4];
        const swags = Math.max(1, Math.round(a.distanceTo(b) / 2.4));
        for (let s = 0; s < swags; s++) {
          const p0 = a.clone().lerp(b, s / swags);
          const p1 = a.clone().lerp(b, (s + 1) / swags);
          for (let k = 0; k < 6; k++) {
            const t = k / 6;
            bulbs.push(p0.clone().lerp(p1, t).setY(H - 0.25 - Math.sin(t * Math.PI) * 0.3));
          }
        }
      }
    }
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const colours = def.lights.map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    bulbs.forEach((p, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
      mesh.setColorAt(i, colours[i % colours.length]);
    });
    group.add(mesh);
    const tmp = new THREE.Color();
    let time = 0;
    animate.push((dt) => {
      if (reducedMotion) return;
      time += dt;
      for (let i = 0; i < bulbs.length; i++) {
        const k = 0.6 + 0.4 * Math.sin(time * 2.2 + i * 1.3);
        mesh.setColorAt(i, tmp.copy(colours[i % colours.length]).multiplyScalar(k));
      }
      mesh.instanceColor.needsUpdate = true;
    });
  }

  // ── Things drifting down (snow, leaves, petals) ──
  if (def.falling) {
    const { emoji, speed } = def.falling;
    const count = Math.round(def.falling.count * (reducedMotion ? 0.4 : 1));
    for (const [e, kind] of emoji.map((x, i) => [x, i])) {
      const per = rooms.length * Math.ceil(count / emoji.length);
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.14, 0.14),
        new THREE.MeshBasicMaterial({ map: emojiTexture(e), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
        per,
      );
      mesh.frustumCulled = false;
      const flakes = [];
      for (let i = 0; i < per; i++) {
        const room = rooms[i % rooms.length];
        flakes.push({
          x: room.x0 + 0.4 + rand() * (room.width - 0.8), z: room.z0 + 0.4 + rand() * (room.depth - 0.8), y: rand() * H,
          speed: speed * (0.6 + rand() * 0.8) * (reducedMotion ? 0.5 : 1), sway: rand() * 6.3, spin: (rand() - 0.5) * 2, size: 0.7 + rand() * 0.6, kind,
        });
      }
      group.add(mesh);
      const dummy = new THREE.Object3D();
      let time = 0;
      animate.push((dt) => {
        time += dt;
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.y -= f.speed * dt;
          if (f.y < 0.05) f.y = H - 0.3;
          dummy.position.set(f.x + Math.sin(time * 0.8 + f.sway) * 0.35, f.y, f.z + Math.cos(time * 0.6 + f.sway) * 0.25);
          dummy.rotation.set(Math.sin(time + f.sway) * 0.8, time * f.spin + f.sway, Math.cos(time * 0.7 + f.sway) * 0.6);
          const fade = Math.min(1, f.y / 0.4, (H - 0.3 - f.y) / 0.4);
          dummy.scale.setScalar(f.size * Math.max(0.001, fade));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
  }

  // ── Props ──
  const first = rooms[0];
  const centre = first ? { x: first.cx, z: first.cz + 0.8 } : { x: 0, z: 0 };
  /** Two spots beside every doorway (in the room before it), on the floor. */
  const doorSides = doorsOut.flatMap((d) => [-1, 1].map((s) => ({ x: d.x + s * (d.width / 2 + 0.6), z: d.zSouthFace + 0.55 })));
  const block = (x, z, r) => colliders.push({ minX: x - r, maxX: x + r, minY: 0, maxY: 1, minZ: z - r, maxZ: z + r });

  for (const prop of def.props) {
    if (prop === 'pumpkins') {
      const spots = [...doorSides, ...rooms.map((r) => ({ x: r.x0 + 0.7, z: r.z1 - 0.7 })), ...rooms.map((r) => ({ x: r.x1 - 0.7, z: r.z1 - 0.7 }))];
      for (const [i, s] of spots.entries()) {
        group.add(pumpkin(s.x, s.z, 0.75 + (i % 3) * 0.15, rand));
        block(s.x, s.z, 0.3);
      }
    } else if (prop === 'bats') {
      for (const room of rooms) {
        for (let i = 0; i < (reducedMotion ? 1 : 3); i++) {
          const b = bat();
          const r = Math.min(room.width, room.depth) / 2 - 1.6;
          const phase = rand() * 6.3;
          const speed = 0.35 + rand() * 0.25;
          const y = H - 0.7 - rand() * 0.5;
          group.add(b.object);
          let time = 0;
          animate.push((dt) => {
            time += dt;
            const a = phase + time * speed * (reducedMotion ? 0.3 : 1);
            b.object.position.set(room.cx + Math.cos(a) * r, y + Math.sin(time * 2 + phase) * 0.12, room.cz + Math.sin(a) * r);
            b.object.rotation.y = -a; // facing along the circle
            b.flap(time * (reducedMotion ? 4 : 14));
          });
        }
      }
    } else if (prop === 'cobwebs') {
      const tex = cobwebTexture();
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      for (const room of rooms) {
        // In the two far corners, just under the ceiling, across the corner.
        for (const [x, z, ry] of [[room.x0 + 0.42, room.z0 + 0.42, Math.PI / 4], [room.x1 - 0.42, room.z0 + 0.42, -Math.PI / 4]]) {
          const web = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mat);
          web.position.set(x, H - 0.45, z);
          web.rotation.y = ry;
          group.add(web);
        }
      }
    } else if (prop === 'ghosts') {
      const mat = new THREE.SpriteMaterial({ map: emojiTexture('👻'), transparent: true, depthWrite: false, opacity: 0.85 });
      for (const room of rooms) {
        const g = new THREE.Sprite(mat);
        g.scale.setScalar(0.45);
        const phase = rand() * 6.3;
        group.add(g);
        let time = 0;
        animate.push((dt) => {
          time += dt;
          g.position.set(room.cx + Math.sin(time * 0.25 + phase) * (room.width / 2 - 2), 2.9 + Math.sin(time * 1.3 + phase) * 0.15, room.cz + Math.cos(time * 0.2 + phase) * (room.depth / 2 - 2));
        });
      }
    } else if (prop === 'tree' && first) {
      group.add(christmasTree(centre.x, centre.z, animate, reducedMotion));
      block(centre.x, centre.z, 0.75);
    } else if (prop === 'garlands') {
      for (const d of doorsOut) group.add(garland(d));
    } else if (prop === 'snowman' && first) {
      group.add(snowman(centre.x, centre.z));
      block(centre.x, centre.z, 0.45);
    } else if (prop === 'balloons') {
      for (const room of rooms) {
        for (const [x, z] of [[room.x0 + 0.5, room.z1 - 0.5], [room.x1 - 0.5, room.z1 - 0.5]]) {
          const b = heartBalloons(x, z, rand);
          group.add(b.object);
          animate.push(b.update);
        }
      }
    } else if (prop === 'flowers' || prop === 'sunflowers') {
      for (const [i, s] of doorSides.entries()) {
        group.add(prop === 'flowers' ? flowerPot(s.x, s.z, i) : sunflowers(s.x, s.z, rand));
        block(s.x, s.z, 0.3);
      }
    } else if (prop === 'butterflies') {
      for (const room of rooms) {
        for (let i = 0; i < (reducedMotion ? 1 : 3); i++) {
          const b = butterfly(['#ffb3c6', '#a0c4ff', '#ffd166', '#caffbf'][Math.floor(rand() * 4)]);
          const phase = rand() * 6.3;
          group.add(b.object);
          let time = 0;
          animate.push((dt) => {
            time += dt;
            const t = time * (reducedMotion ? 0.3 : 1) + phase;
            b.object.position.set(room.cx + Math.sin(t * 0.31) * (room.width / 2 - 1.5), 1.6 + Math.sin(t * 1.1) * 0.5, room.cz + Math.sin(t * 0.23 + 1) * (room.depth / 2 - 1.5));
            b.object.rotation.y = t * 0.4;
            b.flap(time * (reducedMotion ? 5 : 18));
          });
        }
      }
    } else if (prop === 'leafPiles') {
      const colours = ['#e76f51', '#f4a261', '#e9c46a', '#bc4b2a'].map((c) => lambert(c, { flatShading: true }));
      for (const room of rooms) {
        for (const [x, z] of [[room.x0 + 0.6, room.z1 - 0.6], [room.x1 - 0.6, room.z1 - 0.6]]) {
          const pile = new THREE.Group();
          for (let i = 0; i < 26; i++) {
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), colours[i % colours.length]);
            const a = rand() * 6.3;
            const r = rand() * 0.45;
            leaf.position.set(x + Math.cos(a) * r, 0.03 + (0.45 - r) * 0.35 * rand(), z + Math.sin(a) * r);
            leaf.scale.set(1.6, 0.35, 1.2);
            leaf.rotation.set(rand(), rand() * 6, rand());
            pile.add(leaf);
          }
          group.add(pile);
        }
      }
    }
  }

  return {
    group,
    update(dt) {
      for (const fn of animate) fn(dt);
    },
  };
}

// ── Props ────────────────────────────────────────────────────────────
function pumpkin(x, z, size, rand) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.28, 24, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Ribs: push the surface in and out around the stem.
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const k = 1 + 0.06 * Math.cos(a * 8);
    pos.setX(i, px * k);
    pos.setZ(i, pz * k);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, lambert('#f07c1b'));
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.22;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 8), lambert('#5b7a2e'));
  stem.position.y = 0.46;
  stem.rotation.z = 0.2;
  g.add(body, stem);
  // A carved, glowing face (on half of them).
  if (rand() > 0.35) {
    const light = glowing('#ffd36b');
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.05, 3), light);
      eye.position.set(s * 0.09, 0.27, 0.285);
      eye.rotation.z = Math.PI / 2;
      g.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16, Math.PI, Math.PI), light);
    mouth.position.set(0, 0.17, 0.29);
    mouth.scale.y = 0.6;
    g.add(mouth);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rand() * 6.3;
  g.scale.setScalar(size);
  return g;
}

function bat() {
  const object = new THREE.Group();
  const black = lambert('#1d1620', { side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), black);
  body.scale.set(0.8, 0.8, 1.3);
  object.add(body);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.28, 0.08);
  wingShape.lineTo(0.24, -0.02);
  wingShape.lineTo(0.17, 0.02);
  wingShape.lineTo(0.12, -0.04);
  wingShape.lineTo(0.05, -0.02);
  wingShape.lineTo(0, 0);
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), black);
    w.rotation.x = -Math.PI / 2;
    w.scale.x = s;
    pivot.add(w);
    object.add(pivot);
    return { pivot, s };
  });
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), black);
    ear.position.set(s * 0.025, 0.06, 0.04);
    object.add(ear);
  }
  return {
    object,
    flap: (t) => wings.forEach(({ pivot, s }) => (pivot.rotation.z = s * Math.sin(t) * 0.7)),
  };
}

function cobwebTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  g.lineWidth = 1.6;
  const cx = 128;
  const cy = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180);
    g.stroke();
  }
  for (let r = 24; r < 180; r += 26) {
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      const sag = i % 1 === 0 ? 0.92 : 1;
      const x = cx + Math.cos(a) * r * sag;
      const y = cy + Math.sin(a) * r * sag;
      if (i === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(cx + Math.cos(a - Math.PI / 16) * r * 0.82, cy + Math.sin(a - Math.PI / 16) * r * 0.82, x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function christmasTree(x, z, animate, reducedMotion) {
  const g = new THREE.Group();
  const green = lambert('#2f7d4f', { flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 10), lambert('#6b4423'));
  trunk.position.y = 0.17;
  g.add(trunk);
  const layers = [[0.95, 0.9, 0.55], [0.75, 0.8, 1.05], [0.52, 0.7, 1.5], [0.3, 0.55, 1.9]];
  for (const [r, h, y] of layers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), green);
    cone.position.y = y;
    g.add(cone);
  }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.28), { depth: 0.04, bevelEnabled: false }).center(), glowing('#ffd166'));
  star.position.y = 2.28;
  g.add(star);
  // Baubles and little lights spiralling around the tree.
  const baubleGeos = { red: [], gold: [] };
  const lights = [];
  for (let i = 0; i < 34; i++) {
    const t = i / 34;
    const y = 0.45 + t * 1.6;
    const r = 0.92 * (1 - t * 0.8) + 0.03;
    const a = i * 2.4;
    if (i % 2) baubleGeos[i % 4 === 1 ? 'red' : 'gold'].push(new THREE.SphereGeometry(0.055, 10, 8).translate(Math.cos(a) * r, y, Math.sin(a) * r));
    else lights.push(new THREE.Vector3(Math.cos(a + 1.2) * r, y + 0.05, Math.sin(a + 1.2) * r));
  }
  g.add(new THREE.Mesh(mergeGeometries(baubleGeos.red), new THREE.MeshPhongMaterial({ color: '#d62839', shininess: 90 })));
  g.add(new THREE.Mesh(mergeGeometries(baubleGeos.gold), new THREE.MeshPhongMaterial({ color: '#e0b84c', shininess: 90 })));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), lights.length);
  const colours = ['#ff6b6b', '#ffd166', '#4dabf7', '#ffffff'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  lights.forEach((p, i) => {
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    bulbs.setColorAt(i, colours[i % 4]);
  });
  g.add(bulbs);
  // Presents underneath.
  [['#d62839', '#ffd166', 0.6, 0.3, 0.32], ['#4dabf7', '#ffffff', -0.55, 0.45, 0.26], ['#3ddc84', '#d62839', 0.1, -0.65, 0.3]].forEach(([c, ribbon, px, pz, s]) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), lambert(c));
    box.position.set(px, s * 0.4, pz);
    box.rotation.y = px * 2;
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.82, 0.04), lambert(ribbon));
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, s * 0.82, s * 1.02), lambert(ribbon));
    box.add(r1, r2);
    g.add(box);
  });
  let time = 0;
  const tmp = new THREE.Color();
  animate.push((dt) => {
    time += dt;
    star.rotation.y = time * 0.6;
    if (reducedMotion) return;
    for (let i = 0; i < lights.length; i++) bulbs.setColorAt(i, tmp.copy(colours[i % 4]).multiplyScalar(0.55 + 0.45 * Math.sin(time * 3 + i)));
    bulbs.instanceColor.needsUpdate = true;
  });
  g.position.set(x, 0, z);
  return g;
}

function starShape(size) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.4 : 1) * size * 0.5;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return shape;
}

/** A pine garland with a red bow over a doorway. */
function garland(door) {
  const g = new THREE.Group();
  const z = door.zSouthFace + 0.08;
  const half = door.width / 2 + 0.15;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(door.x - half, door.height - 0.1, z),
    new THREE.Vector3(door.x - half * 0.5, door.height - 0.32, z),
    new THREE.Vector3(door.x, door.height - 0.4, z),
    new THREE.Vector3(door.x + half * 0.5, door.height - 0.32, z),
    new THREE.Vector3(door.x + half, door.height - 0.1, z),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 8), lambert('#2f7d4f', { flatShading: true })));
  const red = lambert('#d62839');
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), red);
    loop.scale.set(1.3, 0.8, 0.5);
    loop.position.set(door.x + s * 0.1, door.height - 0.35, z + 0.05);
    g.add(loop);
  }
  return g;
}

function snowman(x, z) {
  const g = new THREE.Group();
  const snow = lambert('#fbfdff');
  [[0.42, 0.38], [0.3, 0.98], [0.21, 1.42]].forEach(([r, y]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), snow);
    ball.position.y = y;
    g.add(ball);
  });
  const coal = lambert('#222');
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), coal);
    eye.position.set(s * 0.07, 1.48, 0.19);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 10), lambert('#f08a24'));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.42, 0.27);
  g.add(nose);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), lambert('#d62839'));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.24;
  g.add(scarf);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16), coal);
  hat.position.y = 1.7;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), coal);
  brim.position.y = 1.6;
  g.add(hat, brim);
  g.position.set(x, 0, z);
  return g;
}

function heartBalloons(x, z, rand) {
  const object = new THREE.Group();
  const balloons = [];
  const colours = ['#ff4d6d', '#ff8fab', '#ffffff'];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const top = 1.9 + i * 0.25;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, top - 0.6, 4), lambert('#f4f1ec'));
    string.position.y = (top + 0.6) / 2;
    const heart = new THREE.Mesh(
      new THREE.ExtrudeGeometry(heartShape(0.32), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 16 }).center(),
      new THREE.MeshPhongMaterial({ color: colours[i], shininess: 80, specular: '#ffd0da' }),
    );
    heart.position.y = top + 0.15;
    b.add(string, heart);
    b.position.set(x + (i - 1) * 0.18, 0, z + (rand() - 0.5) * 0.2);
    b.rotation.z = (i - 1) * 0.1;
    object.add(b);
    balloons.push({ b, phase: rand() * 6 });
  }
  // A little weight on the floor holds the strings.
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), lambert('#ff4d6d'));
  weight.position.set(x, 0.06, z);
  object.add(weight);
  let time = 0;
  return {
    object,
    update: (dt) => {
      time += dt;
      for (const { b, phase } of balloons) {
        b.rotation.x = Math.sin(time * 0.9 + phase) * 0.05;
        b.children[1].rotation.y = Math.sin(time * 0.6 + phase) * 0.5;
      }
    },
  };
}

function flowerPot(x, z, i) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 14), lambert('#c97b5a'));
  pot.position.y = 0.2;
  g.add(pot);
  const colours = ['#ff8fab', '#ffd166', '#cdb4db', '#ffffff', '#ff6b6b'];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4 + i;
    const r = 0.04 + (k % 3) * 0.05;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), lambert('#4f9a48'));
    stem.position.set(Math.cos(a) * r, 0.52, Math.sin(a) * r);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), lambert(colours[(k + i) % colours.length]));
    bloom.position.set(Math.cos(a) * r * 1.3, 0.7 + (k % 2) * 0.05, Math.sin(a) * r * 1.3);
    g.add(stem, bloom);
  }
  g.position.set(x, 0, z);
  return g;
}

function sunflowers(x, z, rand) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 14), lambert('#3d6fb6'));
  pot.position.y = 0.2;
  g.add(pot);
  const petal = lambert('#ffd166', { side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const h = 1.0 + k * 0.22;
    const a = k * 2.1;
    const fx = Math.cos(a) * 0.08;
    const fz = Math.sin(a) * 0.08;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, h, 6), lambert('#4f9a48'));
    stem.position.set(fx, 0.4 + h / 2 - 0.2, fz);
    g.add(stem);
    const head = new THREE.Group();
    head.position.set(fx, 0.2 + h, fz);
    head.rotation.set(-0.3, rand() * 6, 0);
    const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16), lambert('#6b4423'));
    centre.rotation.x = Math.PI / 2;
    head.add(centre);
    for (let p = 0; p < 12; p++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), petal);
      const pa = (p / 12) * Math.PI * 2;
      leaf.position.set(Math.cos(pa) * 0.12, Math.sin(pa) * 0.12, 0);
      leaf.rotation.z = pa - Math.PI / 2;
      head.add(leaf);
    }
    g.add(head);
  }
  g.position.set(x, 0, z);
  return g;
}

function butterfly(color) {
  const object = new THREE.Group();
  const mat = lambert(color, { side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat);
    w.scale.set(1, 1.3, 1);
    w.position.x = s * 0.055;
    w.rotation.x = -Math.PI / 2;
    pivot.add(w);
    object.add(pivot);
    return { pivot, s };
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 2, 6), lambert('#2b1d17'));
  body.rotation.x = Math.PI / 2;
  object.add(body);
  return { object, flap: (t) => wings.forEach(({ pivot, s }) => (pivot.rotation.z = s * (0.2 + Math.abs(Math.sin(t)) * 1.0))) };
}
