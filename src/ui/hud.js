import { EMOTES, MENU } from '../player/emotes.js';

/** Room name (top left), wardrobe / actions / ♥ / mute buttons (top right), who's here, room titles and hints. */
export class Hud {
  constructor(el, music) {
    this.el = el;
    this.roomLabel = el.querySelector('.hud-room');
    this.toast = el.querySelector('.hud-toast');
    this.hint = el.querySelector('.hud-hint');
    this.mute = el.querySelector('.hud-mute');
    this.heart = el.querySelector('.hud-heart');
    this.peopleChip = el.querySelector('.hud-people');
    this.music = music;
    this.names = new Map(); // uid → name of everyone else here
    this.onEmote = () => {};
    this.onAction = () => {}; // (letter)
    this.onWardrobe = () => {}; // the 👕 button
    this.#buildActions();
    const wardrobe = el.querySelector('.hud-wardrobe');
    wardrobe.addEventListener('click', () => {
      wardrobe.blur(); // so Space/Enter go back to the game afterwards
      this.closeActions();
      this.onWardrobe();
    });
    this.heart.addEventListener('click', () => {
      this.onEmote();
      this.heart.blur();
      this.heart.classList.remove('pop');
      void this.heart.offsetWidth; // restart the little bounce
      this.heart.classList.add('pop');
    });

    this.mute.addEventListener('click', () => {
      music.toggleMute();
      this.mute.blur(); // so Space/Enter go back to the game
    });
    music.onChange = () => this.#renderMute();
    this.#renderMute();
  }

  show() {
    this.el.hidden = false;
  }

  /**
   * Update the room label and briefly show the room's title in big letters.
   * `galleryRooms` = number of photo rooms (not counting the hidden last room).
   */
  setRoom(room, index, galleryRooms) {
    this.roomLabel.textContent = room.title;
    const eyebrow = room.isFinale ? '♥' : `Room ${index + 1} of ${galleryRooms}`;
    this.toast.innerHTML = '';
    const small = document.createElement('span');
    small.textContent = eyebrow;
    const big = document.createElement('strong');
    big.textContent = room.title;
    this.toast.append(small, big);
    this.toast.classList.remove('show');
    void this.toast.offsetWidth; // restart the CSS animation
    this.toast.classList.add('show');
  }

  /** The 😊 menu: all 26 actions (the same as the keys A–Z). */
  #buildActions() {
    const button = this.el.querySelector('.hud-actions');
    const panel = this.el.querySelector('.actions-panel');
    const grid = panel.querySelector('.actions-grid');
    const toggle = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    this.closeActions = () => toggle(false);
    button.addEventListener('click', () => {
      toggle(panel.hidden);
      button.blur();
    });
    for (const key of MENU) {
      const def = EMOTES[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'action';
      b.title = `${def.label} (${key})`;
      b.innerHTML = `<span class="action-emoji"></span><span class="action-key">${key}</span><span class="action-label"></span>`;
      b.querySelector('.action-emoji').textContent = def.emoji;
      b.querySelector('.action-label').textContent = def.label;
      b.addEventListener('click', () => {
        toggle(false);
        b.blur();
        this.onAction(key); // runs inside the tap: sitting at a video can start it with sound
      });
      grid.append(b);
    }
  }

  /** Everyone else in the museum (Map uid → { name }): updates the chip and says hello/goodbye. */
  setPeople(people) {
    for (const [uid, p] of people) if (!this.names.has(uid)) this.showHint(`${p.name} is here ♥`, 4000);
    for (const [uid, name] of this.names) if (!people.has(uid)) this.showHint(`${name} left the museum`, 3000);
    this.names = new Map([...people].map(([uid, p]) => [uid, p.name]));
    const list = [...this.names.values()];
    this.peopleChip.hidden = list.length === 0;
    this.peopleChip.textContent = list.length === 1 ? `♥ with ${list[0]}` : `♥ ${list.length + 1} here`;
  }

  showHint(text, ms = 6000) {
    this.hint.textContent = text;
    this.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.classList.remove('show'), ms);
  }

  #renderMute() {
    const { muted, available, started } = this.music;
    this.mute.hidden = !available || !started;
    this.mute.classList.toggle('muted', muted);
    this.mute.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
    this.mute.setAttribute('aria-pressed', String(muted));
  }
}
