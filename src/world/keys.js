/**
 * The key hunt in 3D: little keys (or hearts, stars…) painted into the photos
 * on the walls, where the curator hid them. Tap one to find it — it pops and
 * sparkles away. By default they're small and blend in; "easy to spot" makes
 * them bigger, with a soft pulsing glow.
 */
import * as THREE from 'three';
import { radialGlowTexture } from './textures.js';
import { shapeOf, hiddenKeys } from '../hunt.js';

const PHOTO_Z = 0.06 * 0.45 + 0.008; // just in front of the photo (frames.js: DEPTH * 0.45)

function emojiTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param frames  buildFrames() result (each item knows where its photo hangs)
 * @param hunt    the museum's hunt settings (museumConfig.js)
 * @returns { group, items: [{ key, mesh }], setFound(Set), update(dt), hit(raycaster) → key | null }
 */
export function buildKeys(frames, hunt) {
  const group = new THREE.Group();
  group.name = 'keys';
  const items = [];
  if (!hunt.enabled) return { group, items, setFound() {}, update() {}, hit: () => null };

  const photos = frames.items.map((i) => i.photo);
  const material = new THREE.MeshBasicMaterial({ map: emojiTexture(shapeOf(hunt).emoji), transparent: true, depthWrite: false, toneMapped: false, opacity: hunt.obvious ? 1 : 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ map: radialGlowTexture(), color: '#fff1b8', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const size = hunt.obvious ? 0.17 : 0.085;

  for (const key of hiddenKeys(hunt, photos)) {
    const frame = frames.items.find((i) => i.photo.id === key.photo);
    if (!frame) continue;
    const holder = new THREE.Group();
    const local = new THREE.Vector3((key.x - 0.5) * frame.width, (0.5 - key.y) * frame.height, PHOTO_Z);
    holder.position.copy(local.applyMatrix4(frame.place));
    holder.rotation.y = frame.rotationY;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.renderOrder = 3;
    mesh.userData.keyId = key.id;
    holder.add(mesh);
    let glow = null;
    if (hunt.obvious) {
      glow = new THREE.Mesh(new THREE.PlaneGeometry(size * 2.6, size * 2.6), glowMat);
      glow.position.z = -0.001;
      glow.renderOrder = 2;
      holder.add(glow);
    }
    group.add(holder);
    items.push({ key, holder, mesh, glow, found: false, pop: 0, phase: Math.random() * 6 });
  }

  let time = 0;
  return {
    group,
    items,
    /** Hide the keys that have been found (a little pop for new finds). */
    setFound(found) {
      for (const it of items) {
        const isFound = found.has(it.key.id);
        if (isFound && !it.found) it.pop = 0.001; // start the pop
        if (!isFound) {
          it.pop = 0;
          it.holder.visible = true;
          it.holder.scale.setScalar(1);
        }
        it.found = isFound;
      }
    },
    update(dt) {
      time += dt;
      for (const it of items) {
        if (it.found) {
          if (it.pop > 0 && it.pop < 1) {
            it.pop = Math.min(1, it.pop + dt / 0.45);
            it.holder.scale.setScalar(1 + Math.sin(it.pop * Math.PI) * 0.8 - it.pop);
            if (it.pop >= 1) it.holder.visible = false;
          } else if (it.pop === 0) it.holder.visible = false;
          continue;
        }
        if (it.glow) {
          const beat = 0.5 + 0.5 * Math.sin(time * 3 + it.phase);
          it.glow.material.opacity = 0.45 + 0.4 * beat;
          it.mesh.scale.setScalar(1 + 0.08 * beat);
        }
      }
    },
    /** The key under the pointer (if any, and not found yet). */
    hit(raycaster) {
      const live = items.filter((it) => !it.found).map((it) => it.mesh);
      const h = raycaster.intersectObjects(live, false)[0];
      return h ? { key: items.find((it) => it.mesh === h.object).key, distance: h.distance } : null;
    },
  };
}
