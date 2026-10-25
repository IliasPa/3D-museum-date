/**
 * Picture frames: moulding, mat board, the photo itself, a little museum
 * label, and a faked spotlight (glow on the wall + soft beam + lamp).
 *
 * Frames that share a material are merged into one mesh, so even a big
 * gallery is only a handful of draw calls — important for phones.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_HEIGHT } from './layout.js';
import { radialGlowTexture, beamTexture, textTexture } from './textures.js';

const MAT = 0.07; // mat board margin around the photo (m)
const BORDER = 0.07; // frame moulding width (m)
const DEPTH = 0.06; // how far the frame sticks out of the wall (m)
const LAMP_OUT = 1.3; // the lamp rail's distance from the wall (matches museum.js)

const STYLES = {
  walnut: { frame: '#4a2e1f', mat: '#f7f2ea', shininess: 30 },
  gold: { frame: '#c49a45', mat: '#f8f4ec', shininess: 80 },
  black: { frame: '#1e1c1d', mat: '#f7f4ef', shininess: 50 },
  white: { frame: '#f1ede6', mat: '#ffffff', shininess: 20 },
};

export function buildFrames(plan, config, renderer, onProgress = () => {}) {
  const group = new THREE.Group();
  group.name = 'frames';
  const style = STYLES[config.frames.style] ?? STYLES.walnut;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const frameMat = new THREE.MeshPhongMaterial({ color: style.frame, shininess: style.shininess, specular: 0x332211 });
  const matMat = new THREE.MeshLambertMaterial({ color: style.mat });
  const glowTex = radialGlowTexture();
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
  const wallGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffcf96', opacity: 0.5, ...additive });
  const floorGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffcf96', opacity: 0.16, ...additive });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffe2b8', opacity: 0.07, side: THREE.DoubleSide, ...additive });
  const lampMat = new THREE.MeshLambertMaterial({ color: '#2a2627' });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3d6' });

  const buckets = { frame: [], mat: [], wallGlow: [], floorGlow: [], beam: [], lamp: [], bulb: [] };
  const items = [];
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded, total);
  const loader = new THREE.TextureLoader(manager);

  // Load the first rooms' photos first, so what you see first appears first.
  const order = plan.frames.map((f, i) => i).sort((a, b) => plan.frames[a].roomIndex - plan.frames[b].roomIndex);

  for (const index of order) {
    const f = plan.frames[index];
    const { width: w, height: h } = f;
    const outerW = w + 2 * (MAT + BORDER);
    const outerH = h + 2 * (MAT + BORDER);

    // Everything below is built in "frame space" (photo facing +Z, wall at z=0)
    // and then moved onto the wall with this matrix.
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(f.x, f.y, f.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rotationY),
      new THREE.Vector3(1, 1, 1),
    );
    const add = (bucket, geo) => buckets[bucket].push(geo.applyMatrix4(place));

    // Frame moulding: four bars.
    const bar = (bw, bh, x, y) => add('frame', new THREE.BoxGeometry(bw, bh, DEPTH).translate(x, y, DEPTH / 2));
    bar(outerW, BORDER, 0, (outerH - BORDER) / 2);
    bar(outerW, BORDER, 0, -(outerH - BORDER) / 2);
    bar(BORDER, outerH - 2 * BORDER, -(outerW - BORDER) / 2, 0);
    bar(BORDER, outerH - 2 * BORDER, (outerW - BORDER) / 2, 0);
    // Mat board, slightly recessed behind the moulding.
    add('mat', new THREE.PlaneGeometry(outerW - 2 * BORDER, outerH - 2 * BORDER).translate(0, 0, DEPTH * 0.45));

    // Faked spotlight: warm glow on the wall around the frame (brightest at the top)…
    add('wallGlow', new THREE.PlaneGeometry(outerW * 2.1, outerH * 2.3).translate(0, outerH * 0.18, 0.004));
    // …a soft pool of light on the floor below…
    add('floorGlow', new THREE.PlaneGeometry(outerW * 1.7, 1.8).rotateX(-Math.PI / 2).translate(0, -f.y + 0.004, 0.75));
    // …a lamp on the ceiling rail…
    const lampPos = new THREE.Vector3(0, WALL_HEIGHT - f.y - 0.2, LAMP_OUT);
    const aim = new THREE.Vector3(0, 0.15, 0).sub(lampPos).normalize();
    const lampRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim);
    add('lamp', new THREE.CylinderGeometry(0.075, 0.055, 0.22, 10).applyQuaternion(lampRot).translate(lampPos.x, lampPos.y, lampPos.z));
    add('lamp', new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6).translate(lampPos.x, lampPos.y + 0.12, lampPos.z));
    add('bulb', new THREE.CircleGeometry(0.05, 10).rotateX(Math.PI / 2)
      .applyQuaternion(lampRot).translate(...lampPos.clone().addScaledVector(aim, 0.111).toArray()));
    // …and a faint beam from the lamp to the photo.
    const target = new THREE.Vector3(0, 0.1, 0.02);
    const length = lampPos.distanceTo(target);
    add('beam', new THREE.ConeGeometry(Math.max(outerW, outerH) * 0.55, length, 18, 1, true)
      .translate(0, -length / 2, 0)
      .applyQuaternion(lampRot)
      .translate(lampPos.x, lampPos.y, lampPos.z));

    // The photo itself: unlit (so colours stay true) and not tone-mapped.
    const photoMat = new THREE.MeshBasicMaterial({ color: f.photo.color || '#cccccc', toneMapped: false });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat);
    photo.position.set(0, 0, DEPTH * 0.45 + 0.002).applyMatrix4(place);
    photo.rotation.y = f.rotationY;
    photo.userData.frameIndex = items.length;
    group.add(photo);
    loader.load(f.photo.src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      photoMat.map = tex;
      photoMat.color.set('#ffffff');
      photoMat.needsUpdate = true;
    });

    // Museum label next to the frame (title + date).
    if (f.photo.title || f.photo.date) {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.17),
        new THREE.MeshLambertMaterial({
          map: textTexture([
            { text: f.photo.title, font: '600 34px Manrope, sans-serif', color: '#2b2522', gap: 6 },
            { text: f.photo.date, font: '400 28px Manrope, sans-serif', color: '#7b706a' },
          ], { width: 320, height: 160, padding: 14 }),
          transparent: true,
        }),
      );
      const lx = outerW / 2 + 0.32;
      const ly = -h / 2 + 0.1;
      add('mat', new THREE.PlaneGeometry(0.36, 0.19).translate(lx, ly, 0.008)); // white card behind the text
      label.position.set(lx, ly, 0.01).applyMatrix4(place);
      label.rotation.y = f.rotationY;
      group.add(label);
    }

    items.push({
      ...f,
      mesh: photo,
      // A spot on the floor in front of the photo, used for "am I close?" checks.
      center: new THREE.Vector3(f.x, f.y, f.z),
      normal: new THREE.Vector3(f.nx, 0, f.nz),
      outerW,
      outerH,
      place,
    });
  }

  const merged = [
    ['frame', frameMat], ['mat', matMat], ['wallGlow', wallGlowMat], ['floorGlow', floorGlowMat],
    ['beam', beamMat], ['lamp', lampMat], ['bulb', bulbMat],
  ];
  for (const [key, mat] of merged) {
    if (!buckets[key].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(buckets[key]), mat);
    if (key.includes('Glow') || key === 'beam') mesh.renderOrder = 1;
    group.add(mesh);
  }

  // Extra glow that fades in on the photo you're standing in front of.
  const highlightMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffd9a6', opacity: 0, ...additive });
  const highlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMat);
  highlight.renderOrder = 2;
  highlight.visible = false;
  group.add(highlight);
  let highlighted = null;

  return {
    group,
    items,
    /** Call every frame with the item the avatar is close to (or null). */
    update(dt, active) {
      if (active) {
        highlighted = active;
        highlight.visible = true;
        highlight.position.set(0, active.outerH * 0.1, 0.006).applyMatrix4(active.place);
        highlight.rotation.y = active.rotationY;
        highlight.scale.set(active.outerW * 2.4, active.outerH * 2.2, 1);
      }
      const target = active ? 0.55 : 0;
      highlightMat.opacity += (target - highlightMat.opacity) * Math.min(1, dt * 5);
      if (!active && highlightMat.opacity < 0.01) highlight.visible = false;
      return highlighted;
    },
  };
}
