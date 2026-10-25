/**
 * Background music with a mute button.
 *
 * iPhones only allow sound to start from a tap, so start() must be called from
 * the "Enter" button's click handler. A plain <audio> element is used (rather
 * than Web Audio) because it also plays when the iPhone's silent switch is on.
 *
 * The song can arrive later (a couple's own song downloads from the database):
 * start() "unlocks" the audio element with a moment of silence, and
 * setSource() then switches to the real song without needing another tap.
 */
const STORAGE_KEY = 'museum-muted';
// A tiny silent sound file, played once to unlock audio before the song is ready.
const SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';

export class Music {
  constructor({ volume }, title) {
    this.volume = volume;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
    this.available = false; // true once a song is set
    this.started = false;
    this.onChange = () => {};
    this.muted = readMuted();

    this.audio.addEventListener('error', () => {
      if (this.audio.src === SILENCE) return;
      this.available = false;
      console.info('[music] the song could not be played');
      this.onChange();
    });

    // Pause when the tab/app is in the background, resume when back.
    document.addEventListener('visibilitychange', () => {
      if (!this.started || this.muted || !this.available || this.videoPlaying) return;
      if (document.hidden) this.audio.pause();
      else this.#play();
    });

    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: '♥' });
    }
  }

  /** Use this song (a URL; can be called before or after start()). */
  setSource(url) {
    if (!url) return;
    this.audio.loop = true;
    this.audio.src = url;
    this.available = true;
    if (this.started && !this.muted) this.#play(true);
    this.onChange();
  }

  /** Must run inside a click/tap handler (iOS rule). */
  start() {
    this.started = true;
    if (!this.available) this.audio.src = SILENCE; // unlock now, the song follows (not looped)
    if (!this.muted) this.#play(this.available);
    this.onChange();
  }

  /** While a video plays, the music waits. */
  pauseForVideo() {
    this.videoPlaying = true;
    this.audio.pause();
  }

  resumeAfterVideo() {
    this.videoPlaying = false;
    if (this.started && !this.muted && this.available) this.#play(true);
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {}
    if (this.muted) this.audio.pause();
    else if (this.started && !this.videoPlaying) this.#play();
    this.onChange();
  }

  #play(fadeIn = false) {
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
