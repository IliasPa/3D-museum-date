/**
 * The hidden last room: a red curtain that parts as you walk up, a glowing
 * heart on a pedestal, floating hearts, fairy lights, and your message
 * framed on the wall.
 */
import * as THREE from 'three';
import { WALL_HEIGHT as H } from './layout.js';
import { radialGlowTexture, wrapText, seededRandom } from './textures.js';

const HEART_COUNT = 46;
const NEAR_DISTANCE = 3.0; // walk this close to the heart to read the letter
const CURTAIN_OPEN_DISTANCE = 3.6;

/** Classic heart outline, about 1 unit wide, pointing down. */
export function heartShape(size = 1) {
  const s = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.95 * s);
  shape.bezierCurveTo(-0.35 * s, -0.6 * s, -1.0 * s, -0.25 * s, -1.0 * s, 0.25 * s);
  shape.bezierCurveTo(-1.0 * s, 0.75 * s, -0.4 * s, 0.95 * s, 0, 0.5 * s);
  shape.bezierCurveTo(0.4 * s, 0.95 * s, 1.0 * s, 0.75 * s, 1.0 * s, 0.25 * s);
  shape.bezierCurveTo(1.0 * s, -0.25 * s, 0.35 * s, -0.6 * s, 0, -0.95 * s);
  return shape;
}

export function buildFinale(plan, finaleConfig, colliders) {
  const room = plan.rooms.find((r) => r.isFinale);
  const door = plan.doors.find((d) => d.curtain);
  if (!room || !door) return null;

  const group = new THREE.Group();
  group.name = 'finale';
  const center = new THREE.Vector3(room.cx, 0, room.cz + 0.6);

  // ── Rug ──────────────────────────────────────────────────────────
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 48),
    new THREE.MeshLambertMaterial({ map: rugTexture(), polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(center.x, 0.006, center.z);
  group.add(rug);

  // ── Pedestal + heart sculpture ───────────────────────────────────
  const marble = new THREE.MeshLambertMaterial({ color: '#f4eee8' });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 24), marble);
  pedestal.position.set(center.x, 0.5, center.z);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 24), marble);
  top.position.set(center.x, 1.04, center.z);
  group.add(pedestal, top);
  colliders.push({ minX: center.x - 0.55, maxX: center.x + 0.55, minY: 0, maxY: 1.1, minZ: center.z - 0.55, maxZ: center.z + 0.55 });

  const heartGeo = new THREE.ExtrudeGeometry(heartShape(0.85), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 4, curveSegments: 20 });
  heartGeo.center();
  const heart = new THREE.Mesh(heartGeo, new THREE.MeshPhongMaterial({ color: '#e23a5c', emissive: '#6e0d24', shininess: 90, specular: '#ffd0da' }));
  heart.position.set(center.x, 1.75, center.z);
  group.add(heart);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture(), color: '#ff7a9a', transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.scale.setScalar(2.8);
  glow.position.copy(heart.position);
  group.add(glow);

  const heartLight = new THREE.PointLight('#ff6f8f', 6, 6, 1.6);
  heartLight.position.set(center.x, 2.2, center.z + 0.6);
  group.add(heartLight);

  // ── Floating hearts (one draw call for all of them) ──────────────
  const smallHeart = new THREE.ShapeGeometry(heartShape(0.16), 8);
  const floating = new THREE.InstancedMesh(smallHeart, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), HEART_COUNT);
  const rand = seededRandom(42);
  const palette = ['#ff6f91', '#ff9eb5', '#ffd1dc', '#e23a5c', '#ffffff'].map((c) => new THREE.Color(c));
  const hearts = [];
  for (let i = 0; i < HEART_COUNT; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 0.8 + rand() * (Math.min(room.width, room.depth) / 2 - 1.2);
    hearts.push({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
      y: rand() * H,
      speed: 0.18 + rand() * 0.3,
      sway: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 2,
      size: 0.6 + rand() * 0.9,
    });
    floating.setColorAt(i, palette[i % palette.length]);
  }
  floating.frustumCulled = false;
  group.add(floating);

  // ── Fairy lights along the top of the walls ──────────────────────
  const bulbs = [];
  const sag = (a, b, t) => a.clone().lerp(b, t).setY(H - 0.35 - Math.sin(t * Math.PI) * 0.35);
  const corners = [
    [room.x0 + 0.05, room.z1 - 0.05], [room.x0 + 0.05, room.z0 + 0.05], [room.x1 - 0.05, room.z0 + 0.05], [room.x1 - 0.05, room.z1 - 0.05],
  ].map(([x, z]) => new THREE.Vector3(x, H - 0.35, z));
  for (let w = 0; w < 3; w++) {
    const [a, b] = [corners[w], corners[w + 1]];
    const swags = Math.round(a.distanceTo(b) / 2.2);
    for (let s = 0; s < swags; s++) {
      const p0 = a.clone().lerp(b, s / swags);
      const p1 = a.clone().lerp(b, (s + 1) / swags);
      for (let k = 0; k < 7; k++) bulbs.push(sag(p0, p1, k / 7));
    }
  }
  const fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
  const m = new THREE.Matrix4();
  bulbs.forEach((p, i) => {
    fairy.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    fairy.setColorAt(i, new THREE.Color('#ffe2a8'));
  });
  group.add(fairy);

  // ── The letter on the far wall ───────────────────────────────────
  const letterW = 2.3;
  const letterH = 2.9;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(letterW + 0.2, letterH + 0.2, 0.06), new THREE.MeshPhongMaterial({ color: '#c49a45', shininess: 80, specular: '#fff0c0' }));
  frame.position.set(room.cx, 2.15, room.z0 + 0.03);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(letterW, letterH), new THREE.MeshBasicMaterial({ map: letterTexture(finaleConfig), toneMapped: false }));
  paper.position.set(room.cx, 2.15, room.z0 + 0.065);
  group.add(frame, paper);

  // ── Curtain over the doorway (on the side of the previous room) ──
  const curtain = buildCurtain(door);
  group.add(curtain.group);

  // ── Per-frame animation ──────────────────────────────────────────
  let time = 0;
  let near = false;
  const dummy = new THREE.Object3D();
  const twinkle = new THREE.Color();
  const doorPos = new THREE.Vector3(door.x, 0, (door.zSouthFace + door.zNorthFace) / 2);

  return {
    group,
    room,
    /** Returns true while the avatar is close enough to read the letter. */
    update(dt, avatarPos) {
      time += dt;
      heart.rotation.y = time * 0.8;
      heart.position.y = 1.75 + Math.sin(time * 1.6) * 0.06;
      glow.position.y = heart.position.y;
      glow.material.opacity = 0.5 + Math.sin(time * 2.4) * 0.12;

      for (let i = 0; i < HEART_COUNT; i++) {
        const h = hearts[i];
        h.y += h.speed * dt;
        if (h.y > H - 0.3) h.y = 0.1;
        const fade = Math.min(1, h.y / 0.6, (H - 0.3 - h.y) / 0.8); // grow in, shrink out
        dummy.position.set(h.x + Math.sin(time * 0.9 + h.sway) * 0.25, h.y, h.z + Math.cos(time * 0.7 + h.sway) * 0.2);
        dummy.rotation.set(0, time * h.spin + h.sway, Math.sin(time + h.sway) * 0.3);
        dummy.scale.setScalar(h.size * Math.max(0.001, fade));
        dummy.updateMatrix();
        floating.setMatrixAt(i, dummy.matrix);
      }
      floating.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < bulbs.length; i++) {
        const t = 0.65 + 0.35 * Math.sin(time * 2 + i * 1.7);
        fairy.setColorAt(i, twinkle.setRGB(1 * t, 0.86 * t, 0.62 * t));
      }
      fairy.instanceColor.needsUpdate = true;

      curtain.update(dt, avatarPos.distanceTo(doorPos) < CURTAIN_OPEN_DISTANCE);

      const d = Math.hypot(avatarPos.x - center.x, avatarPos.z - center.z);
      near = near ? d < NEAR_DISTANCE + 0.6 : d < NEAR_DISTANCE; // a little hysteresis
      return near;
    },
  };
}

/** Two velvet curtain halves that gather to the sides when opened. */
function buildCurtain(door) {
  const group = new THREE.Group();
  const halfW = door.width / 2 + 0.12;
  const h = door.height + 0.05;
  const velvet = new THREE.MeshLambertMaterial({ color: '#8e1530', side: THREE.DoubleSide });
  const z = door.zSouthFace + 0.1;
  const halves = [-1, 1].map((side) => {
    const geo = new THREE.PlaneGeometry(halfW, h, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 26) * 0.045); // folds
    geo.computeVertexNormals();
    geo.translate(-side * halfW / 2, h / 2, 0); // pivot at the outer edge
    const pivot = new THREE.Group();
    pivot.position.set(door.x + side * halfW, 0, z);
    pivot.add(new THREE.Mesh(geo, velvet));
    group.add(pivot);
    return pivot;
  });
  // Brass rod.
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, door.width + 0.6, 10), new THREE.MeshPhongMaterial({ color: '#c49a45', shininess: 80 }));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(door.x, h + 0.04, z);
  group.add(rod);

  let open = 0;
  return {
    group,
    update(dt, shouldOpen) {
      open += ((shouldOpen ? 1 : 0) - open) * (1 - Math.exp(-dt * 4));
      const s = 1 - open * 0.8;
      for (const half of halves) half.scale.x = s;
    },
  };
}

/** Round rose rug with golden rings and little hearts. */
function rugTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  g.fillStyle = '#9c2f45';
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  for (const [rad, width, color] of [[r - 18, 14, '#d9b36c'], [r - 70, 4, '#f3c9a0'], [r * 0.45, 6, '#d9b36c']]) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.arc(r, r, rad, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#f7c6cf';
  g.font = '44px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.fillText('♥', r + Math.cos(a) * (r - 120), r + Math.sin(a) * (r - 120));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Cream paper with the message, auto-sized so any length fits. */
function letterTexture({ title, message, signature }) {
  const w = 1024;
  const h = 1290;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#fffaf2');
  grad.addColorStop(1, '#f6e9d8');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9b36c';
  g.lineWidth = 4;
  g.strokeRect(36, 36, w - 72, h - 72);

  g.textAlign = 'center';
  g.fillStyle = '#8e1530';
  g.font = '500 92px "EB Garamond", Georgia, serif';
  g.fillText(title, w / 2, 170);
  g.font = '40px serif';
  g.fillText('♥', w / 2, 240);

  // Find the biggest font size at which the whole message fits.
  const top = 300;
  const bottom = h - 190;
  let size = 56;
  let lines;
  for (; size > 18; size -= 2) {
    g.font = `italic 400 ${size}px "EB Garamond", Georgia, serif`;
    lines = wrapText(g, message, w - 200);
    if (lines.length * size * 1.35 <= bottom - top) break;
  }
  g.fillStyle = '#3b2a26';
  const lh = size * 1.35;
  let y = top + (bottom - top - lines.length * lh) / 2 + lh * 0.75;
  for (const line of lines) {
    g.fillText(line, w / 2, y);
    y += lh;
  }
  g.font = 'italic 500 54px "EB Garamond", Georgia, serif';
  g.fillStyle = '#8e1530';
  g.fillText(signature, w / 2, h - 110);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
