/** The personal message, shown as a letter when you reach the heart in the last room. */
export class Letter {
  constructor(el, finale) {
    this.el = el;
    this.setContent(finale);
    this.dismissed = false;
    el.querySelector('.letter-close').addEventListener('click', () => {
      this.dismissed = true; // stays closed until you walk away and come back
      this.hide();
    });
  }

  /** Title, message and signature (each museum has its own). */
  setContent(finale) {
    this.el.querySelector('.letter-title').textContent = finale.title;
    this.el.querySelector('.letter-message').textContent = finale.message;
    this.el.querySelector('.letter-signature').textContent = finale.signature;
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
