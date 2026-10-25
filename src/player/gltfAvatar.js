/**
 * Optional: use your own .glb character (e.g. from Mixamo) instead of the
 * built-in one. Enable it in config.js → avatar.type = 'glb'.
 * See README → "Use your own avatar" for how to make the file.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { blobShadow } from './avatar.js';

export class GltfAvatar {
  static async load(options) {
    const url = new URL(options.url, document.baseURI).href;
    const gltf = await new GLTFLoader().loadAsync(url);
    return new GltfAvatar(gltf, options);
  }

  constructor(gltf, options) {
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.root.add(blobShadow());

    // Scale the model to the requested height, stand it on the floor, centre it.
    const model = gltf.scene;
    model.rotation.y = options.rotationY || 0;
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(options.height / (box.max.y - box.min.y || 1));
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    model.traverse((o) => {
      if (o.isSkinnedMesh) o.frustumCulled = false; // skinned bounds are often wrong
    });
    this.root.add(model);

    // Animations: find clips by (partial, case-insensitive) name.
    const clips = gltf.animations;
    const find = (name) => name && clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    const idle = find(options.idleClip) ?? clips[0];
    const walk = find(options.walkClip) ?? clips[1] ?? idle;
    const run = find(options.runClip);
    if (!clips.length) console.warn('[avatar] the .glb has no animations — it will glide around');

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, clip] of Object.entries({ idle, walk, run })) {
      if (!clip) continue;
      if (key !== 'idle') removeRootMotion(clip);
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(key === 'idle' ? 1 : 0);
      action.play();
      this.actions[key] = action;
    }
    this.speed = 0;
  }

  update(dt, speed01) {
    this.speed += (speed01 - this.speed) * Math.min(1, dt * 8);
    const s = this.speed;
    const { idle, walk, run } = this.actions;
    if (run) {
      // idle → walk over 0…0.55, walk → run over 0.55…1
      const toWalk = Math.min(1, s / 0.55);
      const toRun = Math.max(0, (s - 0.55) / 0.45);
      idle?.setEffectiveWeight(1 - toWalk);
      walk?.setEffectiveWeight(toWalk * (1 - toRun));
      run.setEffectiveWeight(toRun);
    } else {
      const toWalk = Math.min(1, s * 1.6);
      idle?.setEffectiveWeight(1 - toWalk);
      if (walk && walk !== idle) {
        walk.setEffectiveWeight(toWalk);
        walk.setEffectiveTimeScale(0.75 + s * 0.6);
      }
    }
    this.mixer.update(dt);
  }
}

/**
 * Mixamo walk cycles often move the hips forward ("root motion"), which would
 * make the model drift away from where the game puts it. Pin hips X/Z.
 * (Ticking "In Place" when downloading from Mixamo does the same thing.)
 */
function removeRootMotion(clip) {
  const track = clip.tracks.find((t) => /hips\.position$/i.test(t.name)) ??
    clip.tracks.find((t) => t.name.endsWith('.position'));
  if (!track) return;
  const v = track.values;
  for (let i = 0; i < v.length; i += 3) {
    v[i] = v[0];
    v[i + 2] = v[2];
  }
}
