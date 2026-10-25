/** The title screen with the "Enter" button (which also unlocks audio on iPhone). */
export class StartScreen {
  constructor(el, config, isTouch) {
    this.el = el;
    this.button = el.querySelector('.start-enter');
    this.status = el.querySelector('.start-status');
    el.querySelector('.start-title').textContent = config.title;
    el.querySelector('.start-subtitle').textContent = config.subtitle;
    el.querySelector('.start-hint').textContent = isTouch
      ? 'Left thumb to walk · swipe to look around · tap a photo to open it'
      : 'WASD or arrow keys to walk · drag to look around · click a photo to open it';
    this.label = config.enterLabel;
    document.title = config.title;
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  setProgress(loaded, total) {
    this.setStatus(loaded < total ? `Hanging the photos… ${loaded} / ${total}` : '');
  }

  /** Enable the button; `onEnter` runs inside the click (needed for iPhone audio). */
  ready(onEnter) {
    this.button.disabled = false;
    this.button.textContent = this.label;
    this.button.addEventListener('click', () => {
      this.button.disabled = true;
      onEnter();
      this.el.classList.add('leaving');
      setTimeout(() => (this.el.hidden = true), 1000);
    }, { once: true });
    this.button.focus({ preventScroll: true });
  }

  error(message) {
    this.button.hidden = true;
    this.setStatus(message);
    this.status.classList.add('error');
  }
}
