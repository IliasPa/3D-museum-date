/**
 * Videos on wall spots (layout.js): each hangs in a frame like a photo. While
 * you stand in front of one it plays there silently, on a loop; a tap (or
 * Space) shows it full screen with sound (ui/film.js). One plays at a time.
 */
import * as THREE from 'three';

export class WallVideos {
  /** @param items the frames' wall items that are videos (frames.js) */
  constructor(items = []) {
    this.items = items;
    this.item = null; // the one playing on the wall
    this.el = null;
    this.texture = null;
    this.loud = false; // playing with sound (full screen)
    for (const item of items) {
      /** Download the film (once); `item.url` is set when it's here. */
      item.load = () => (item.loading ??= item.photo.video.url?.()
        .then((url) => (item.url = url))
        .catch((err) => {
          item.loading = null; // try again next time
          console.warn('[video] could not load:', err.message);
        }));
    }
  }

  /** Download the videos of a room and the next one in the background (like the bench videos). */
  preload(roomIndex) {
    for (const item of this.items) if (item.roomIndex === roomIndex || item.roomIndex === roomIndex + 1) item.load();
  }

  /** Every frame, with the wall item you're standing at (or null): play that one, stop the others. */
  update(focus) {
    if (this.loud) return; // full screen: keep going
    const want = focus?.isVideo ? focus : null;
    if (want !== this.item) this.play(want);
    else if (want && !this.el && want.url) this.play(want); // it has just arrived
  }

  play(item) {
    this.stop();
    if (!item) return;
    this.item = item;
    if (!item.url) {
      item.load();
      return; // update() starts it once it's here
    }
    const el = (this.el = document.createElement('video'));
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.muted = true;
    el.loop = true;
    el.src = item.url;
    el.play().catch(() => {});
    this.texture = new THREE.VideoTexture(el);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    item.mesh.material.userData.playing = true;
    item.mesh.material.map = this.texture;
    item.mesh.material.color.set('#ffffff');
    item.mesh.material.needsUpdate = true;
    if (item.badge) item.badge.visible = false;
  }

  /**
   * The video to show full screen, with sound — call inside the tap / key
   * (phones only allow sound then). Null while it's still downloading.
   */
  forFullScreen(item) {
    if (this.item !== item || !this.el) this.play(item);
    if (!this.el) return null;
    this.el.muted = false;
    this.el.play().catch(() => {});
    this.loud = true;
    return this.el;
  }

  /** Back from full screen: silent again on the wall. */
  quiet() {
    this.loud = false;
    if (!this.el) return;
    this.el.muted = true;
    this.el.play().catch(() => {});
  }

  stop() {
    const item = this.item;
    this.item = null;
    this.loud = false;
    if (!this.el) return;
    this.el.pause();
    this.el.remove(); // in case it was shown full screen
    this.el.removeAttribute('src');
    this.el.load();
    this.texture?.dispose();
    item.mesh.material.userData.playing = false;
    item.mesh.material.map = item.mesh.material.userData.poster ?? null;
    if (!item.mesh.material.map) item.mesh.material.color.set(item.photo.color);
    item.mesh.material.needsUpdate = true;
    if (item.badge) item.badge.visible = true;
    this.el = null;
    this.texture = null;
  }
}
