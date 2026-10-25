/** The soft card with title, date and caption that appears near a photo. */
export class Placard {
  constructor(el, isTouch) {
    this.el = el;
    this.date = el.querySelector('.placard-date');
    this.title = el.querySelector('.placard-title');
    this.caption = el.querySelector('.placard-caption');
    el.querySelector('.placard-cta').textContent = isTouch ? 'Tap to view' : 'Click or press E to view';
    this.current = null;
    this.onOpen = () => {};
    el.addEventListener('click', () => {
      el.blur(); // so Space/Enter go back to the game afterwards
      if (this.current) this.onOpen(this.current);
    });
  }

  show(item) {
    this.current = item;
    const p = item.photo;
    this.date.textContent = p.date;
    this.title.textContent = p.title;
    this.caption.textContent = p.caption;
    this.date.hidden = !p.date;
    this.caption.hidden = !p.caption;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  hide() {
    this.current = null;
    this.el.classList.remove('show');
  }
}
