/**
 * A film, full screen: the video that's playing on the wall, made big.
 * Opened with Space (or a tap on the screen) while sitting on the bench;
 * Space again, Esc, × or a tap beside the picture goes back — and the film
 * keeps playing on the wall.
 *
 * Computers (and iPads) get real full screen; iPhones, which only allow that
 * for a bare video, get the iPhone's own video player.
 */
export class Film {
  constructor(el) {
    this.el = el;
    this.stage = el.querySelector('.film-stage');
    this.title = el.querySelector('.film-title');
    this.video = null;
    this.onClose = () => {};

    el.querySelector('.film-close').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target === this.stage) this.close();
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen || (e.code !== 'Space' && e.key !== 'Escape')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.close();
    }, { capture: true });
    // Leaving full screen the browser's way (Esc, the green button…) closes it too.
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(type, () => {
        if (this.isOpen && this.fullscreen && !fullscreenElement()) this.close();
      });
    }
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** Call inside the keypress / tap (browsers only allow full screen then). */
  open(video, title = '') {
    if (!video || this.isOpen) return;
    this.video = video;
    this.title.textContent = title;
    video.controls = true;
    this.stage.append(video);
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
    this.fullscreen = false;
    const request = this.el.requestFullscreen ?? this.el.webkitRequestFullscreen;
    if (request && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
      this.fullscreen = true;
      Promise.resolve(request.call(this.el)).catch(() => (this.fullscreen = false)); // still a big overlay
    } else if (video.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen(); // iPhone
        video.addEventListener('webkitendfullscreen', () => this.close(), { once: true });
      } catch {
        // The overlay will do.
      }
    }
    video.play().catch(() => {});
    keepGoing(video);
  }

  close() {
    if (!this.isOpen) return;
    const video = this.video;
    this.video = null;
    if (fullscreenElement()) Promise.resolve((document.exitFullscreen ?? document.webkitExitFullscreen).call(document)).catch(() => {});
    this.el.classList.remove('show');
    this.el.hidden = true;
    if (video?.isConnected) {
      // Back to the wall only: out of the page again, as before (Safari suspends a
      // video that's in the page but can't be seen). Leaving the page pauses it, so play on.
      const playing = !video.paused;
      video.controls = false;
      video.remove();
      if (playing) {
        const resume = () => video.play().catch(() => {});
        resume();
        video.addEventListener('pause', resume, { once: true }); // some browsers pause a moment later
        setTimeout(() => video.removeEventListener('pause', resume), 500);
        keepGoing(video);
      }
    }
    this.onClose();
  }
}

/** Safari sometimes crawls along after a video is moved; if it isn't moving on, give it a nudge. */
function keepGoing(video) {
  const from = video.currentTime;
  setTimeout(() => {
    if (!video.paused && video.src && video.currentTime - from < 0.15) {
      video.pause();
      video.play().catch(() => {});
    }
  }, 500);
}

function fullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}
