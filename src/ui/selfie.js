/**
 * The bench selfie (P while sitting): a white flash, then a little card with
 * the picture. On a computer it's downloaded right away; on a phone "Save"
 * opens the share sheet (→ Save Image), since phones only allow that from a tap.
 */
export class Selfie {
  constructor(el, flashEl, { isTouch }) {
    this.el = el;
    this.flashEl = flashEl;
    this.isTouch = isTouch;
    this.img = el.querySelector('.selfie-img');
    this.save = el.querySelector('.selfie-save');
    this.note = el.querySelector('.selfie-note');
    el.querySelector('.selfie-close').addEventListener('click', () => this.hide());
    this.save.addEventListener('click', () => this.#save());
  }

  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth; // restart the animation
    this.flashEl.classList.add('go');
  }

  /** Show (and, on a computer, download) a new picture. */
  show(blob) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.blob = blob;
    this.url = URL.createObjectURL(blob);
    this.img.src = this.url;
    this.name = `museum-selfie-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.jpg`;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
    if (this.isTouch) {
      this.note.textContent = 'Your selfie ♥';
      this.save.textContent = 'Save';
    } else {
      this.#download();
      this.note.textContent = 'Saved to your downloads ♥';
      this.save.textContent = 'Save again';
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), 12000);
  }

  hide() {
    this.el.classList.remove('show');
    setTimeout(() => (this.el.hidden = true), 300);
  }

  async #save() {
    const file = new File([this.blob], this.name, { type: 'image/jpeg' });
    if (this.isTouch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    this.#download();
  }

  #download() {
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.name;
    document.body.append(a);
    a.click();
    a.remove();
  }
}
