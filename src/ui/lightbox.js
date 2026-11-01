/**
 * Full-screen photo viewer. Shows the wall-sized image instantly, then swaps
 * in the sharp full-size version once it has loaded.
 * Close: ×, Esc, or tap the dark background. Browse: ‹ › buttons, arrow keys, or swipe.
 * During a key hunt, the photo's hidden keys can be tapped here too.
 */
export class Lightbox {
  constructor(el) {
    this.el = el;
    this.img = el.querySelector('.lightbox-img');
    this.title = el.querySelector('.lightbox-title');
    this.date = el.querySelector('.lightbox-date');
    this.caption = el.querySelector('.lightbox-caption');
    this.counter = el.querySelector('.lightbox-counter');
    this.prevBtn = el.querySelector('.lightbox-prev');
    this.nextBtn = el.querySelector('.lightbox-next');
    this.list = [];
    this.index = 0;
    this.onClose = () => {};
    // Key hunt: keysFor(photo) → [{ id, x, y }] still to find; onFindKey(id).
    this.keysFor = () => [];
    this.keyEmoji = '🔑';
    this.keyClass = '';
    this.onFindKey = () => {};
    this.keys = document.createElement('div');
    this.keys.className = 'lightbox-keys';
    el.querySelector('.lightbox-stage').append(this.keys);
    this.img.addEventListener('load', () => this.#placeKeys());
    addEventListener('resize', () => this.isOpen && this.#placeKeys());

    el.querySelector('.lightbox-close').addEventListener('click', () => this.close());
    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));

    // Tap the background to close; swipe left/right to browse.
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, target: e.target }));
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const onBackground = down.target === el || down.target.classList.contains('lightbox-stage') || down.target.classList.contains('lightbox-keys');
      down = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 10 && onBackground) this.close();
    });

    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.step(1);
      else if (e.key === 'ArrowLeft') this.step(-1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** `list`: photo items (from the same room), `index`: which one to show. */
  open(list, index) {
    this.list = list;
    this.index = index;
    this.#render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
    this.el.querySelector('.lightbox-close').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('show');
    setTimeout(() => {
      this.el.hidden = true;
      this.token = (this.token ?? 0) + 1; // ignore photos still on their way
      this.img.removeAttribute('src');
    }, 250);
    this.onClose();
  }

  /** Re-draw the hunt's keys (e.g. after one was found). */
  refreshKeys() {
    if (this.isOpen) this.#placeKeys();
  }

  /** The keys still hidden in this photo, over the picture (positions in % of it). */
  #placeKeys() {
    const item = this.list[this.index];
    const keys = item ? this.keysFor(item.photo) : [];
    this.keys.replaceChildren();
    if (!keys.length || !this.img.complete || !this.img.naturalWidth) return;
    const stage = this.keys.parentElement.getBoundingClientRect();
    const r = this.img.getBoundingClientRect();
    for (const k of keys) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lightbox-key ${this.keyClass}`;
      b.textContent = this.keyEmoji;
      b.setAttribute('aria-label', 'A hidden key — tap to find it');
      b.style.left = `${r.left - stage.left + k.x * r.width}px`;
      b.style.top = `${r.top - stage.top + k.y * r.height}px`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('pointerup', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.classList.add('found');
        b.disabled = true;
        this.onFindKey(k.id);
      });
      this.keys.append(b);
    }
  }

  step(delta) {
    if (this.list.length < 2) return;
    this.index = (this.index + delta + this.list.length) % this.list.length;
    this.#render();
  }

  #render() {
    const { photo } = this.list[this.index];
    this.title.textContent = photo.title;
    this.date.textContent = photo.date;
    this.caption.textContent = photo.caption;
    this.date.hidden = !photo.date;
    this.caption.hidden = !photo.caption;
    const many = this.list.length > 1;
    this.prevBtn.hidden = this.nextBtn.hidden = !many;
    this.counter.textContent = many ? `${this.index + 1} / ${this.list.length}` : '';
    this.img.alt = photo.title || 'Photo';

    // Show the wall-sized version immediately (already downloaded), then swap
    // in the sharp full-size one when it arrives.
    const token = (this.token = (this.token ?? 0) + 1);
    let sharp = false;
    this.img.removeAttribute('src');
    this.keys.replaceChildren();
    photo.url('md').then((url) => {
      if (token === this.token && !sharp) this.img.src = url;
    }).catch(() => {});
    photo.url('lg').then((url) => {
      if (token !== this.token) return;
      sharp = true;
      this.img.src = url;
    }).catch(() => {});
  }
}
