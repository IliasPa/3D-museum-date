/**
 * The start screen. It walks through a few steps, one at a time:
 *   signin → busy → (denied | choose) → ready (dress up in the avatar studio, then "Enter")
 * The "Enter" button also unlocks audio on iPhone.
 */
import { AvatarStudio } from './avatarStudio.js';

export class StartScreen {
  constructor(el, config, isTouch) {
    this.el = el;
    this.config = config;
    this.title = el.querySelector('.start-title');
    this.subtitle = el.querySelector('.start-subtitle');
    this.status = el.querySelector('.start-status');
    this.account = el.querySelector('.start-account');
    el.querySelector('.start-hint').textContent = isTouch
      ? 'Left thumb to walk · swipe to look around · tap a photo · 😊 for actions'
      : 'Arrow keys to walk · drag to look around · Space opens a photo · A–Z for actions';
    this.setTitle(config.title, config.subtitle);
  }

  setTitle(title, subtitle) {
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    document.title = title;
  }

  /** Show one step, hide the others. */
  show(step) {
    this.el.dataset.step = step; // lets the CSS adapt (e.g. a smaller title next to the look picker)
    for (const s of this.el.querySelectorAll('[data-step]')) s.hidden = s.dataset.step !== step;
    this.status.classList.remove('error');
    this.status.textContent = '';
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  setProgress(loaded, total) {
    this.setStatus(loaded < total ? `Hanging the photos… ${loaded} / ${total}` : '');
  }

  error(message) {
    this.status.textContent = message;
    this.status.classList.add('error');
  }

  /** "Signed in as … · Sign out" (+ a link to /admin for the curator). */
  setAccount(user, isAdmin, onSignOut) {
    this.account.hidden = !user;
    if (!user) return;
    this.account.querySelector('.start-account-email').textContent = user.email;
    this.account.querySelector('.start-admin').hidden = !isAdmin;
    this.account.querySelector('[data-action="signout"]').onclick = onSignOut;
  }

  signIn(onSignIn, { inAppBrowser = false } = {}) {
    this.show('signin');
    this.el.querySelector('.start-inapp').hidden = !inAppBrowser;
    const button = this.el.querySelector('[data-action="google"]');
    button.disabled = false;
    button.onclick = async () => {
      button.disabled = true;
      try {
        await onSignIn();
      } finally {
        button.disabled = false;
      }
    };
  }

  busy(text) {
    this.show('busy');
    this.setStatus(text);
  }

  /** This Google account isn't on any guest list. */
  denied(email, onSwitchAccount) {
    this.show('denied');
    this.el.querySelector('.start-denied-email').textContent = email;
    this.el.querySelector('[data-action="switch"]').onclick = onSwitchAccount;
  }

  /** Several museums: let the visitor pick one. Resolves with the chosen one. */
  choose(museums, message = 'Which museum would you like to visit?') {
    this.show('choose');
    this.el.querySelector('[data-step="choose"] .start-message').textContent = message;
    const list = this.el.querySelector('.start-choices');
    list.replaceChildren();
    return new Promise((resolve) => {
      for (const m of museums) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'start-choice';
        b.textContent = m.name;
        b.onclick = () => resolve(m);
        list.append(b);
      }
    });
  }

  /**
   * Pick a look, then "Enter".
   * @param look          current look
   * @param note          optional line under the button (e.g. curator mode)
   * @param onLookChange  (look) => void
   * @param onEnter       runs inside the click (needed for iPhone audio)
   */
  ready({ look, note = '', onLookChange, onEnter }) {
    this.show('ready');
    this.el.querySelector('.start-note-ready').textContent = note;
    this.#buildStudio(look, onLookChange);
    const button = this.el.querySelector('[data-action="enter"]');
    button.textContent = this.config.enterLabel;
    button.disabled = false;
    button.onclick = () => {
      button.disabled = true;
      onEnter();
      this.studio?.dispose();
      this.el.classList.add('leaving');
      setTimeout(() => (this.el.hidden = true), 1000);
    };
    button.focus({ preventScroll: true });
  }

  #buildStudio(look, onLookChange) {
    this.studio?.dispose();
    this.studio = new AvatarStudio(this.el.querySelector('.look'), { look, onChange: onLookChange });
  }
}
