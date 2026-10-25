/**
 * Background music with a mute button.
 *
 * iPhones only allow sound to start from a tap, so start() must be called from
 * the "Enter" button's click handler. A plain <audio> element is used (rather
 * than Web Audio) because it also plays when the iPhone's silent switch is on.
 */
const STORAGE_KEY = 'museum-muted';

export class Music {
  constructor({ src, volume }, title) {
    this.volume = volume;
    this.audio = new Audio();
    this.audio.src = new URL(src, document.baseURI).href;
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
    this.available = true;
    this.started = false;
    this.onChange = () => {};
    this.muted = readMuted();

    this.audio.addEventListener('error', () => {
      this.available = false;
      console.info(`[music] no song found at ${src} — add one to enable music`);
      this.onChange();
    });

    // Pause when the tab/app is in the background, resume when back.
    document.addEventListener('visibilitychange', () => {
      if (!this.started || this.muted) return;
      if (document.hidden) this.audio.pause();
      else this.#play();
    });

    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: '♥' });
    }
  }

  /** Must run inside a click/tap handler (iOS rule). */
  start() {
    this.started = true;
    if (!this.muted) this.#play(true);
    this.onChange();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {}
    if (this.muted) this.audio.pause();
    else if (this.started) this.#play();
    this.onChange();
  }

  #play(fadeIn = false) {
    if (!this.available) return;
    if (fadeIn) this.#fadeIn();
    else this.audio.volume = this.volume;
    this.audio.play().catch((err) => console.warn('[music] could not start:', err.message));
  }

  /** Gentle fade-in (desktop & Android — iPhones ignore volume, which is fine). */
  #fadeIn() {
    const startTime = performance.now();
    this.audio.volume = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - startTime) / 2500);
      this.audio.volume = this.volume * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
