/**
 * Little visual effects for the avatars' actions: emoji/speech bubbles above
 * heads, floating emoji particles (tears, 💤, notes…) and a rainbow arc.
 * Emoji are drawn with the device's own emoji font, so they look native on
 * iPhone, Android and Windows alike.
 */
import * as THREE from 'three';

const textures = new Map();

/** A canvas texture of an emoji, or of a short text in a speech bubble. */
function labelTexture(content) {
  if (textures.has(content)) return textures.get(content);
  const isText = /[a-z]/i.test(content);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (isText) {
    c.width = 320;
    c.height = 128;
    g.font = '700 46px Manrope, system-ui, sans-serif';
    const w = Math.min(300, g.measureText(content).width + 48);
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.roundRect((320 - w) / 2, 10, w, 86, 40);
    g.moveTo(150, 94);
    g.lineTo(160, 118);
    g.lineTo(172, 94);
    g.fill();
    g.fillStyle = '#8e1530';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(content, 160, 55);
  } else {
    c.width = c.height = 128;
    g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(content, 64, 72);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(content, { tex, aspect: c.width / c.height });
  return textures.get(content);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  /** A bubble that floats above an avatar's head for a moment. */
  bubble(anchor, content, duration = 1.8) {
    const { tex, aspect } = labelTexture(content);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const h = aspect > 1.5 ? 0.3 : 0.38;
    sprite.scale.set(h * aspect, h, 1);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.items.push({ sprite, anchor, age: 0, life: duration, kind: 'bubble', h, aspect });
  }

  /**
   * A floating emoji particle.
   * @param pos  world position (Vector3, copied)
   * @param opts { vx, vy, vz, gravity, life, size, spin }
   */
  emoji(pos, content, opts = {}) {
    const { tex, aspect } = labelTexture(content);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const size = opts.size ?? 0.16;
    sprite.scale.set(size * aspect, size, 1);
    sprite.position.copy(pos);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.items.push({
      sprite, kind: 'particle', age: 0, life: opts.life ?? 1.4, size, aspect,
      v: new THREE.Vector3(opts.vx ?? 0, opts.vy ?? 0.4, opts.vz ?? 0), gravity: opts.gravity ?? 0,
    });
  }

  /** A rainbow thrown into the air at `pos`, arching across the direction `yaw`. */
  rainbow(pos, yaw) {
    const group = new THREE.Group();
    const colours = ['#ff5a5f', '#ff9f43', '#feca57', '#1dd1a1', '#54a0ff', '#a55eea'];
    colours.forEach((c, i) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(1.0 - i * 0.07, 0.035, 6, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
      );
      group.add(arc);
    });
    group.position.copy(pos);
    group.rotation.y = yaw;
    group.scale.setScalar(0.01);
    group.renderOrder = 4;
    this.scene.add(group);
    this.items.push({ sprite: group, kind: 'rainbow', age: 0, life: 3.2 });
  }

  update(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const t = it.age / it.life;
      if (t >= 1) {
        this.scene.remove(it.sprite);
        it.sprite.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        this.items.splice(i, 1);
        continue;
      }
      if (it.kind === 'bubble') {
        it.anchor.getWorldPosition(tmp);
        const pop = Math.min(1, it.age / 0.18);
        it.sprite.position.set(tmp.x, tmp.y + 0.55 + pop * 0.1 + it.age * 0.05, tmp.z);
        it.sprite.scale.set(it.h * it.aspect * (0.6 + 0.4 * pop), it.h * (0.6 + 0.4 * pop), 1);
        it.sprite.material.opacity = Math.min(1, (1 - t) * 4);
      } else if (it.kind === 'particle') {
        it.v.y -= it.gravity * dt;
        it.sprite.position.addScaledVector(it.v, dt);
        it.sprite.material.opacity = Math.min(1, (1 - t) * 3, it.age * 8);
      } else if (it.kind === 'rainbow') {
        const grow = 1 - (1 - Math.min(1, it.age / 0.6)) ** 3;
        it.sprite.scale.setScalar(0.01 + grow);
        it.sprite.position.y += dt * 0.15;
        const fade = Math.min(1, (1 - t) * 3);
        it.sprite.traverse((o) => o.material && (o.material.opacity = 0.9 * fade));
      }
    }
  }
}
