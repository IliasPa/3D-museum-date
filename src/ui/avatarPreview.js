/**
 * A small, slowly turning avatar shown next to the look picker on the start
 * screen. It has its own tiny renderer, which is thrown away after "Enter".
 */
import * as THREE from 'three';
import { ProceduralAvatar } from '../player/avatar.js';
import { EmotePlayer } from '../player/emotes.js';

export class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.emotes = new EmotePlayer();
    const none = () => {};
    this.ctx = { fx: { bubble: none, emoji: none, rainbow: none }, hearts: null, position: new THREE.Vector3(), facing: 0, partner: null };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#fff3e3', '#9a7a66', 2.4));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(1.5, 2.5, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    this.camera.position.set(0, 0.95, 3.4);
    this.camera.lookAt(0, 0.62, 0);
    this.avatar = null;
    this.time = 0;
  }

  /** Show this look (and strike a little pose, `emote` = an action letter). */
  setLook(look, emote = 'V') {
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      this.avatar.root.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this.avatar = new ProceduralAvatar(look);
    this.scene.add(this.avatar.root);
    this.emotes.play(emote);
  }

  start() {
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.time += dt;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (this.avatar) {
        this.avatar.root.rotation.y = Math.sin(this.time * 0.7) * 0.6;
        this.ctx.avatar = this.avatar;
        this.avatar.update(dt, 0, this.emotes.update(dt, this.ctx, false));
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
