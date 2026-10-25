/** Room name (top left), mute button (top right), room titles and hints. */
export class Hud {
  constructor(el, music) {
    this.el = el;
    this.roomLabel = el.querySelector('.hud-room');
    this.toast = el.querySelector('.hud-toast');
    this.hint = el.querySelector('.hud-hint');
    this.mute = el.querySelector('.hud-mute');
    this.music = music;

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
