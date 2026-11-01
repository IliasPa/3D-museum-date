import { EMOTES, MENU, BENCH_MENU } from '../player/emotes.js';

/**
 * Room name (top left), wardrobe / actions / ♥ / mute buttons (top right),
 * who's here, the key hunt's count, the 💍 button (for the one proposing),
 * the guided tour's buttons, room titles and hints.
 */
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
    this.onRing = () => {}; // the 💍 button
    this.onTour = () => {}; // ('toggle' | 'next' | 'stop')
    this.seated = false;
    this.#buildActions();
    const ring = el.querySelector('.hud-ring');
    ring.addEventListener('click', () => {
      ring.blur();
      this.closeActions();
      this.onRing(); // inside the tap
    });
    this.huntChip = el.querySelector('.hud-hunt');
    this.tourBar = el.querySelector('.hud-tour');
    for (const b of this.tourBar.querySelectorAll('[data-tour]')) {
      b.addEventListener('click', () => {
        b.blur();
        this.onTour(b.dataset.tour);
      });
    }
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

  /** The 😊 menu: all 26 actions (the same as the keys A–Z) — the bench ones while sitting. */
  #buildActions() {
    const button = this.el.querySelector('.hud-actions');
    const panel = this.el.querySelector('.actions-panel');
    const toggle = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    this.closeActions = () => toggle(false);
    this.toggleActions = toggle;
    button.addEventListener('click', () => {
      toggle(panel.hidden);
      button.blur();
    });
    this.#fillActions();
  }

  /** Sitting on a bench (or not): the action menu shows what the letters do now. */
  setSeated(seated) {
    if (seated === this.seated) return;
    this.seated = seated;
    this.#fillActions();
  }

  #fillActions() {
    const panel = this.el.querySelector('.actions-panel');
    const grid = panel.querySelector('.actions-grid');
    const toggle = this.toggleActions;
    panel.querySelector('.actions-name').textContent = this.seated ? 'On the bench' : 'Actions';
    grid.replaceChildren();
    for (const key of MENU) {
      const def = EMOTES[this.seated ? BENCH_MENU[key] : key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'action';
      b.title = `${def.label} (${key})`;
      b.innerHTML = `<span class="action-emoji"></span><span class="action-key">${key}</span><span class="action-label"></span>`;
      b.querySelector('.action-emoji').textContent = def.emoji;
      b.querySelector('.action-label').textContent = this.seated && key === 'S' ? 'Stand up' : def.label;
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

  /** The 💍 button: only for the one who proposes (proposal mode on). */
  showRing(show) {
    this.el.querySelector('.hud-ring').hidden = !show;
  }

  /** The key hunt's count (null hides it). */
  setHunt(found, total, emoji, together = false) {
    this.huntChip.hidden = total == null;
    if (total == null) return;
    this.huntChip.textContent = `${emoji} ${found} / ${total}`;
    this.huntChip.title = together ? 'Found together — a find by either of you counts for both' : '';
    this.huntChip.classList.toggle('done', found >= total);
    this.huntChip.classList.remove('pop');
    void this.huntChip.offsetWidth;
    this.huntChip.classList.add('pop');
  }

  /** The guided tour's buttons: 'off' hides them. */
  setTour(state) {
    this.tourBar.hidden = state === 'off';
    const play = this.tourBar.querySelector('[data-tour="toggle"]');
    const paused = state === 'paused' || state === 'done';
    play.textContent = paused ? '▶' : '⏸';
    play.setAttribute('aria-label', paused ? 'Continue the tour' : 'Pause the tour');
    this.tourBar.querySelector('.hud-tour-text').textContent = state === 'done' ? 'Tour finished ♥' : state === 'paused' ? 'Tour paused' : 'Guided tour';
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
