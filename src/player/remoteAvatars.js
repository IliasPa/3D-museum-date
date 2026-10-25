/**
 * The other visitors' avatars. Positions and actions arrive ~10× per second
 * from the Realtime Database (see backend/presence.js); in between, each
 * avatar glides smoothly towards its latest position.
 *
 * When someone aims an action at you (hug, tickle, kiss), onTargeted() tells
 * the game, which plays your reaction — and broadcasts it, so everyone sees it.
 */
import * as THREE from 'three';
import { ProceduralAvatar } from './avatar.js';
import { decodeLook, defaultLook } from './looks.js';
import { EmotePlayer, REACTIONS } from './emotes.js';

export class RemoteAvatars {
  constructor(scene) {
    this.scene = scene;
    this.people = new Map(); // uid → { avatar, emotes, pos, facing, speed, target, … }
    this.selfId = null; // your uid (to recognise actions aimed at you)
    this.onEmote = () => {}; // (x, y, z) — someone pressed ♥
    this.onTargeted = () => {}; // (reactionId, fromUid)
  }

  /** `states`: Map uid → { name, look, x, z, f, s, e, a, an, at } (from presence.js). */
  sync(states) {
    for (const [uid, state] of states) {
      let p = this.people.get(uid);
      const isNew = !p;
      if (!p || p.lookText !== state.look) {
        if (p) this.#remove(uid);
        p = this.#add(uid, state);
      }
      p.target = state;
      p.name = state.name;
      if (state.e && state.e !== p.lastEmote) {
        p.lastEmote = state.e;
        this.onEmote(p.pos.x, 1.5, p.pos.z);
      }
      // Actions: a = which, an = a counter that changes on every new action, at = aimed at whom.
      if ((state.an ?? 0) !== p.actionNonce) {
        p.actionNonce = state.an ?? 0;
        if (state.a) {
          p.emotes.play(state.a, { target: state.at || null });
          if (!isNew && state.at && state.at === this.selfId && REACTIONS[state.a]) this.onTargeted(REACTIONS[state.a], uid);
        }
      }
      if (!state.a && p.emotes.active) p.emotes.stop();
    }
    for (const uid of this.people.keys()) if (!states.has(uid)) this.#remove(uid);
  }

  /**
   * @param ctxFor (person) => emote context ({ fx, hearts, partner… }) built by the game
   */
  update(dt, ctxFor) {
    const k = 1 - Math.exp(-dt * 10);
    for (const p of this.people.values()) {
      const t = p.target;
      p.pos.x += (t.x - p.pos.x) * k;
      p.pos.z += (t.z - p.pos.z) * k;
      let diff = t.f - p.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.facing += diff * k;
      p.speed += ((t.s ?? 0) - p.speed) * k;
      p.avatar.root.position.copy(p.pos);
      p.avatar.root.rotation.y = p.facing;
      const action = p.emotes.update(dt, ctxFor(p), p.speed > 0.08);
      p.avatar.update(dt, p.speed, action);
    }
  }

  /** Everyone else (for "standing close together", holding hands, hugging…). */
  list() {
    return [...this.people.entries()].map(([uid, p]) => ({ uid, ...p }));
  }

  positions() {
    return [...this.people.values()].map((p) => p.pos);
  }

  clear() {
    for (const uid of [...this.people.keys()]) this.#remove(uid);
  }

  #add(uid, state) {
    const look = decodeLook(state.look) ?? defaultLook();
    const avatar = new ProceduralAvatar(look);
    const tag = nameTag(state.name);
    tag.position.y = 1.62;
    avatar.root.add(tag);
    this.scene.add(avatar.root);
    const p = {
      avatar,
      emotes: new EmotePlayer(),
      lookText: state.look,
      pos: new THREE.Vector3(state.x, 0, state.z),
      facing: state.f ?? 0,
      speed: 0,
      target: state,
      lastEmote: state.e ?? 0, // don't replay a ♥ sent before they appeared
      actionNonce: -1,
    };
    this.people.set(uid, p);
    return p;
  }

  #remove(uid) {
    const p = this.people.get(uid);
    if (!p) return;
    this.scene.remove(p.avatar.root);
    p.avatar.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.people.delete(uid);
  }
}

/** A soft name label floating above an avatar. */
function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const g = c.getContext('2d');
  g.font = '600 34px Manrope, sans-serif';
  const text = String(name || 'Guest').slice(0, 18);
  const w = Math.min(248, g.measureText(text).width + 40);
  g.fillStyle = 'rgba(255, 248, 241, 0.92)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 56, 28);
  g.fill();
  g.fillStyle = '#8e1530';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 37);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.72, 0.2, 1);
  sprite.renderOrder = 4;
  return sprite;
}
