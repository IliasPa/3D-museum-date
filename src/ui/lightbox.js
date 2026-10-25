/**
 * Full-screen photo viewer. Shows the wall-sized image instantly, then swaps
 * in the sharp full-size version once it has loaded.
 * Close: ×, Esc, or tap the dark background. Browse: ‹ › buttons, arrow keys, or swipe.
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
      const onBackground = down.target === el || down.target.classList.contains('lightbox-stage');
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
      this.img.removeAttribute('src');
    }, 250);
    this.onClose();
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

    // Show the small version immediately (already downloaded), then the big one.
    this.img.src = photo.src;
    const full = new Image();
    const expected = photo.full;
    full.onload = () => {
      if (this.list[this.index]?.photo.full === expected) this.img.src = expected;
    };
    full.src = expected;
  }
}
