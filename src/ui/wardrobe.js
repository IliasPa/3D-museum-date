/**
 * The wardrobe: the avatar studio again, in the middle of a visit (the 👕
 * button). "Done" (or Esc) closes it; the others see the new look right away.
 */
import { AvatarStudio } from './avatarStudio.js';

export class Wardrobe {
  constructor(el) {
    this.el = el;
    this.container = el.querySelector('.wardrobe-studio');
    this.onClose = () => {}; // (look) — the look it closed with
    el.querySelector('.wardrobe-done').addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => {
      if (!this.isOpen || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    }, { capture: true });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(look) {
    if (this.isOpen) return;
    this.look = { ...look };
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
    this.container.replaceChildren();
    this.studio = new AvatarStudio(this.container, { look, onChange: (next) => (this.look = next) });
    this.el.querySelector('.wardrobe-done').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.studio?.dispose();
    this.studio = null;
    this.el.classList.remove('show');
    this.el.hidden = true;
    this.onClose(this.look);
  }
}
