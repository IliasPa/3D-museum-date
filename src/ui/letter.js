/** The personal message, shown as a letter when you reach the heart in the last room. */
export class Letter {
  constructor(el, finale) {
    this.el = el;
    el.querySelector('.letter-title').textContent = finale.title;
    el.querySelector('.letter-message').textContent = finale.message;
    el.querySelector('.letter-signature').textContent = finale.signature;
    this.dismissed = false;
    el.querySelector('.letter-close').addEventListener('click', () => {
      this.dismissed = true; // stays closed until you walk away and come back
      this.hide();
    });
  }

  /** Called with true when the avatar reaches the heart, false when it walks away. */
  setNear(near) {
    if (near && !this.dismissed) this.show();
    if (!near) {
      this.dismissed = false;
      this.hide();
    }
  }

  show() {
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  hide() {
    this.el.classList.remove('show');
  }
}
