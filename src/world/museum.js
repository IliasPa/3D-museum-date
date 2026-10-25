/**
 * Builds the museum building from the floor plan (layout.js):
 * floor, walls with door openings, ceiling, signs, benches, plants and lights.
 * Also returns the collision boxes used to stop the avatar and the camera.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_THICKNESS as T, WALL_HEIGHT as H } from './layout.js';
import { woodFloorTexture, plasterTexture, textTexture, worldSpaceUVs } from './textures.js';

const DARK_WOOD = '#5a3a28';

export function buildMuseum(plan, config, renderer) {
  const group = new THREE.Group();
  group.name = 'museum';
  /** Axis-aligned boxes {minX,maxX,minY,maxY,minZ,maxZ} that block movement. */
  const colliders = [];
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ── Materials ─────────────────────────────────────────────────────
  const plaster = plasterTexture();
  const wallMats = plan.rooms.map((r) => new THREE.MeshLambertMaterial({ color: r.wall, map: plaster }));
  const trimMat = new THREE.MeshLambertMaterial({ color: DARK_WOOD });

  // Wall geometry is collected per material and merged → only a few draw calls.
  const wallGeos = new Map(); // material → geometries
  const trimGeos = [];

  /**
   * Adds a solid box. `faces` picks a material per side:
   * [+x, −x, +y, −y, +z, −z] (three.js BoxGeometry face order).
   */
  function wallBox(minX, maxX, minY, maxY, minZ, maxZ, faces) {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    worldSpaceUVs(geo, 3);
    // Split the box into its 6 faces so each can go to its own material bucket.
    const nonIndexed = geo.toNonIndexed();
    for (let f = 0; f < 6; f++) {
      const face = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = nonIndexed.attributes[name];
        face.setAttribute(name, new THREE.BufferAttribute(a.array.slice(f * 6 * a.itemSize, (f + 1) * 6 * a.itemSize), a.itemSize));
      }
      const mat = faces[f];
      if (!wallGeos.has(mat)) wallGeos.set(mat, []);
      wallGeos.get(mat).push(face);
    }
    colliders.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }

  function trimBox(minX, maxX, minY, maxY, minZ, maxZ) {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    trimGeos.push(geo);
  }

  // ── Walls ─────────────────────────────────────────────────────────
  plan.rooms.forEach((room, i) => {
    const m = wallMats[i];
    const all = [m, m, m, m, m, m];
    // West and east walls (extended through the corners).
    wallBox(room.x0 - T, room.x0, 0, H, room.z0 - T, room.z1 + T, all);
    wallBox(room.x1, room.x1 + T, 0, H, room.z0 - T, room.z1 + T, all);
    // The first room also needs a south wall (the museum's back wall).
    if (i === 0) wallBox(room.x0 - T, room.x1 + T, 0, H, room.z1, room.z1 + T, all);

    // North wall: shared with the next room (with a door), or the very end wall.
    const next = plan.rooms[i + 1];
    const door = plan.doors.find((d) => d.south === i);
    const minX = Math.min(room.x0, next?.x0 ?? room.x0) - T;
    const maxX = Math.max(room.x1, next?.x1 ?? room.x1) + T;
    // Faces: +z side looks into this room, −z side into the next one.
    const faces = [m, m, m, m, m, next ? wallMats[i + 1] : m];
    const z0 = room.z0 - T;
    const z1 = room.z0;
    if (!door) {
      wallBox(minX, maxX, 0, H, z0, z1, faces);
      return;
    }
    const dl = door.x - door.width / 2;
    const dr = door.x + door.width / 2;
    wallBox(minX, dl, 0, H, z0, z1, faces);
    wallBox(dr, maxX, 0, H, z0, z1, faces);
    wallBox(dl, dr, door.height, H, z0, z1, faces); // lintel above the door

    // Wooden door casing, sticking out a little on both sides. It overlaps the
    // opening by 2 cm so it fully covers the wall's cut edges (no flicker).
    const c = 0.12;
    const o = 0.02;
    trimBox(dl - c, dl + o, 0, door.height + c, z0 - 0.03, z1 + 0.03);
    trimBox(dr - o, dr + c, 0, door.height + c, z0 - 0.03, z1 + 0.03);
    trimBox(dl - c, dr + c, door.height - o, door.height + c, z0 - 0.03, z1 + 0.03);
  });

  // ── Baseboards (skirting) along every wall, with gaps at doors ────
  const bh = 0.14;
  const bd = 0.025;
  plan.rooms.forEach((room, i) => {
    const north = plan.doors.find((d) => d.south === i);
    const south = plan.doors.find((d) => d.north === i);
    trimBox(room.x0, room.x0 + bd, 0, bh, room.z0, room.z1); // west
    trimBox(room.x1 - bd, room.x1, 0, bh, room.z0, room.z1); // east
    for (const [door, z0, z1] of [[north, room.z0, room.z0 + bd], [south, room.z1 - bd, room.z1]]) {
      if (!door) trimBox(room.x0, room.x1, 0, bh, z0, z1);
      else {
        trimBox(room.x0, door.x - door.width / 2 - 0.12, 0, bh, z0, z1);
        trimBox(door.x + door.width / 2 + 0.12, room.x1, 0, bh, z0, z1);
      }
    }
  });

  for (const [mat, geos] of wallGeos) group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  group.add(new THREE.Mesh(mergeGeometries(trimGeos), trimMat));

  // ── Floor & ceiling ───────────────────────────────────────────────
  const { x0, x1, z0, z1 } = plan.bounds;
  const fw = x1 - x0;
  const fd = z1 - z0;
  const wood = woodFloorTexture();
  wood.anisotropy = maxAniso;
  wood.repeat.set(fw / 1.6, fd / 1.6); // one tile = 1.6 m → planks ≈ 20 cm wide
  wood.center.set(0.5, 0.5);
  wood.rotation = Math.PI / 2; // planks run along the walking direction
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(fw, fd),
    new THREE.MeshPhongMaterial({ map: wood, shininess: 26, specular: 0x16110c }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(fw, fd),
    new THREE.MeshLambertMaterial({ color: '#f4ede4', emissive: '#8a8178' }), // faces down, so give it its own glow
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
  group.add(ceiling);
  colliders.push({ minX: x0, maxX: x1, minY: H, maxY: H + 1, minZ: z0, maxZ: z1 }); // stops the camera

  // ── Ceiling light panels and track rails ──────────────────────────
  const panelMat = new THREE.MeshBasicMaterial({ color: '#fff4e2' });
  const railMat = new THREE.MeshLambertMaterial({ color: '#2a2627' });
  const railGeos = [];
  for (const room of plan.rooms) {
    if (room.isFinale) continue;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(room.width - 6, room.depth - 6), panelMat);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(room.cx, H - 0.01, room.cz);
    group.add(panel);
    // Rails 1.3 m from the walls, where the frame spotlights hang.
    const r = 1.3;
    const g1 = new THREE.BoxGeometry(0.06, 0.05, room.depth - 1.2);
    for (const x of [room.x0 + r, room.x1 - r]) railGeos.push(g1.clone().translate(x, H - 0.03, room.cz));
    const g2 = new THREE.BoxGeometry(room.width - 1.2, 0.05, 0.06);
    for (const z of [room.z0 + r, room.z1 - r]) railGeos.push(g2.clone().translate(room.cx, H - 0.03, z));
  }
  if (railGeos.length) group.add(new THREE.Mesh(mergeGeometries(railGeos), railMat));

  // ── Lights ────────────────────────────────────────────────────────
  // One hemisphere light for soft fill + one warm point light per room.
  // The spotlights on frames are faked (see frames.js) — real ones would be
  // far too slow on phones.
  group.add(new THREE.HemisphereLight('#fff3e3', '#7a5a46', 1.6));
  for (const room of plan.rooms) {
    const light = new THREE.PointLight(room.isFinale ? '#ff9db5' : '#ffe1bd', room.isFinale ? 20 : 26, 0, 1.4);
    light.position.set(room.cx, H - 0.6, room.cz);
    group.add(light);
  }

  // ── Signs above the doors ("Our trips", "One more thing…") ────────
  for (const door of plan.doors) {
    const room = plan.rooms[door.south];
    const tex = textTexture([{ text: door.sign, font: '500 120px "EB Garamond", Georgia, serif', color: room.trim, letterSpacing: '6px' }], { width: 1600, height: 220 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.6), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
    sign.position.set(door.x, door.height + (H - door.height) / 2 + 0.05, door.zSouthFace + 0.01);
    group.add(sign);
  }

  // ── Welcome sign on the back wall of the first room ───────────────
  const first = plan.rooms[0];
  const welcome = textTexture([
    { text: config.title, font: '500 150px "EB Garamond", Georgia, serif', color: first.trim, gap: 10 },
    { text: config.subtitle, font: 'italic 400 64px "EB Garamond", Georgia, serif', color: first.trim, letterSpacing: '2px' },
  ], { width: 1600, height: 420 });
  const welcomeSign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.47), new THREE.MeshLambertMaterial({ map: welcome, transparent: true }));
  welcomeSign.position.set(0, 2.4, first.z1 - 0.01);
  welcomeSign.rotation.y = Math.PI; // face north, into the room
  group.add(welcomeSign);

  // ── Furniture: benches and plants ─────────────────────────────────
  const furniture = buildFurniture(plan, colliders);
  group.add(furniture);

  return { group, colliders };
}

/**
 * Benches flanking the centre aisle, and potted plants in the far corners.
 * All pieces sharing a material are merged into one mesh (fewer draw calls).
 */
function buildFurniture(plan, colliders) {
  const parts = {
    seat: { mat: new THREE.MeshLambertMaterial({ color: '#a8754f' }), geos: [] },
    leg: { mat: new THREE.MeshLambertMaterial({ color: '#2d2a2b' }), geos: [] },
    pot: { mat: new THREE.MeshLambertMaterial({ color: '#e9e2d8' }), geos: [] },
    leaf: { mat: new THREE.MeshLambertMaterial({ color: '#5f8f5a', flatShading: true }), geos: [] },
    leaf2: { mat: new THREE.MeshLambertMaterial({ color: '#4c7a4b', flatShading: true }), geos: [] },
  };
  const put = (part, geo, x, y, z) => parts[part].geos.push(geo.translate(x, y, z));

  for (const room of plan.rooms) {
    if (!room.isFinale && room.depth >= 10) {
      // One pair of benches per ~10 m of room length, evenly spread.
      const pairs = Math.max(1, Math.floor(room.depth / 10));
      for (let k = 0; k < pairs; k++) {
        const z = room.z0 + (room.depth * (k + 0.5)) / pairs;
        for (const side of [-1, 1]) {
          const x = room.cx + side * 2.3;
          put('seat', new THREE.BoxGeometry(0.55, 0.08, 2.2), x, 0.46, z);
          for (const dz of [-0.9, 0.9]) put('leg', new THREE.BoxGeometry(0.5, 0.42, 0.07), x, 0.21, z + dz);
          colliders.push({ minX: x - 0.3, maxX: x + 0.3, minY: 0, maxY: 0.5, minZ: z - 1.12, maxZ: z + 1.12 });
        }
      }
    }
    // Plants in the two far (north) corners.
    for (const [px, pz] of [[room.x0 + 0.55, room.z0 + 0.55], [room.x1 - 0.55, room.z0 + 0.55]]) {
      put('pot', new THREE.CylinderGeometry(0.28, 0.22, 0.55, 12), px, 0.275, pz);
      const leaves = [[0, 0.85, 0, 1, 'leaf'], [0.12, 1.15, 0.05, 0.75, 'leaf2'], [-0.1, 1.38, -0.04, 0.55, 'leaf']];
      for (const [lx, ly, lz, s, part] of leaves) {
        const geo = new THREE.IcosahedronGeometry(0.42 * s, 0)
          .rotateX(lx * 5).rotateY(ly * 3).rotateZ(lz * 7);
        put(part, geo, px + lx, ly, pz + lz);
      }
      colliders.push({ minX: px - 0.32, maxX: px + 0.32, minY: 0, maxY: 0.6, minZ: pz - 0.32, maxZ: pz + 0.32 });
    }
  }

  const group = new THREE.Group();
  for (const { mat, geos } of Object.values(parts)) {
    if (geos.length) group.add(new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat));
  }
  return group;
}
