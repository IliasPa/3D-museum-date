/**
 * The simple gallery: the same museum as a scrolling page, for phones too old
 * or too slow for 3D (or without WebGL). Room by room: the photos (tap to see
 * them big — the key hunt works there too), the videos, the mirror's
 * pictures, the memory map and, at the end, the letter.
 */
import { loadWorld, fitView, drawMap, groupPins, placeOf } from '../map/worldMap.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export class Gallery {
  constructor(root, lightbox) {
    this.root = root;
    this.lightbox = lightbox;
    this.onTry3D = () => {};
    this.onFindKey = () => {};
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /**
   * @param config   museumConfig(…)
   * @param photos   the museum's photos (walking order)
   * @param videos   its videos
   * @param mirror   this visitor's mirror pictures
   * @param reason   a line explaining why this is the simple view
   * @param can3D    offer a "Try 3D anyway" button
   */
  open({ config, photos, videos, mirror = [], reason = '', can3D = true }) {
    this.config = config;
    this.photos = photos;
    const r = this.root;
    r.replaceChildren();
    const head = el('header', 'gallery-head');
    head.append(el('p', 'gallery-eyebrow', 'welcome to'), el('h1', 'gallery-title', config.title), el('p', 'gallery-subtitle', config.subtitle));
    const note = el('p', 'gallery-note', reason);
    if (can3D) {
      const b = el('button', 'gallery-link', 'Try the 3D museum anyway');
      b.type = 'button';
      b.addEventListener('click', () => this.onTry3D());
      note.append(' ', b);
    }
    head.append(note);
    this.huntLine = el('p', 'gallery-hunt');
    head.append(this.huntLine);
    r.append(head);

    config.rooms.forEach((room, i) => {
      const inRoom = photos.filter((p) => (p.room ?? 1) === i + 1);
      const films = videos.filter((v) => (v.room ?? 1) === i + 1);
      if (!inRoom.length && !films.length) return;
      const section = el('section', 'gallery-room');
      section.style.setProperty('--trim', room.trim);
      section.append(el('h2', null, room.title));
      const grid = el('div', 'gallery-grid');
      for (const photo of inRoom) grid.append(this.#tile(photo, inRoom));
      for (const video of films) grid.append(this.#film(video));
      section.append(grid);
      r.append(section);
    });

    if (mirror.length) {
      const section = el('section', 'gallery-room gallery-mirror');
      section.append(el('h2', null, '🪞 The mirror'), el('p', 'gallery-small', 'It shows the thing you want the most.'));
      const grid = el('div', 'gallery-grid');
      const items = mirror.map((m) => ({ photo: { ...m, title: 'The mirror', date: '', caption: '' } }));
      for (const item of items) {
        const fig = el('figure', 'gallery-tile');
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        item.photo.url('md').then((url) => (img.src = url)).catch(() => {});
        fig.append(img);
        fig.addEventListener('click', () => this.lightbox.open(items, items.indexOf(item)));
        grid.append(fig);
      }
      section.append(grid);
      r.append(section);
    }

    const pinned = photos.filter(placeOf);
    if (config.memoryMap.enabled && pinned.length) r.append(this.#map(pinned));

    if (config.finale.enabled) {
      this.letter = el('section', 'gallery-letter');
      r.append(this.letter);
    }
    r.append(el('p', 'gallery-end', '♥'));
    this.setHunt(this.hunt ?? null);
    r.hidden = false;
    r.scrollTop = 0;
  }

  close() {
    this.root.hidden = true;
  }

  /** Key hunt: { found, total, emoji, locked, lockText } — or null without a hunt. */
  setHunt(hunt) {
    this.hunt = hunt;
    if (!this.letter && !this.huntLine) return;
    if (this.huntLine) this.huntLine.textContent = hunt ? `${hunt.emoji} ${hunt.found} of ${hunt.total} found — they’re hidden in the photos: open a photo and tap one.` : '';
    if (!this.letter) return;
    const f = this.config.finale;
    this.letter.replaceChildren();
    if (hunt?.locked) {
      this.letter.classList.add('locked');
      this.letter.append(el('p', 'gallery-lock', '🔒'), el('h2', null, f.doorSign), el('p', null, hunt.lockText));
      return;
    }
    this.letter.classList.remove('locked');
    this.letter.append(el('h2', 'letter-title', f.title), el('div', 'letter-heart', '♥'), el('p', 'letter-message', f.message), el('p', 'letter-signature', f.signature));
  }

  #tile(photo, list) {
    const fig = el('figure', 'gallery-tile');
    const img = el('img');
    img.alt = photo.title || '';
    img.loading = 'lazy';
    const thumb = photo.thumbUrl?.();
    if (thumb) img.src = thumb;
    // The sharper picture once it's on screen.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      photo.url('md').then((url) => (img.src = url)).catch(() => {});
    }, { rootMargin: '300px' });
    io.observe(img);
    const cap = el('figcaption');
    if (photo.title) cap.append(el('strong', null, photo.title));
    if (photo.date) cap.append(el('span', null, photo.date));
    fig.append(img, cap);
    fig.addEventListener('click', () => {
      const items = list.map((p) => ({ photo: p }));
      this.lightbox.open(items, list.indexOf(photo));
    });
    return fig;
  }

  #film(video) {
    const fig = el('figure', 'gallery-tile gallery-film');
    const poster = el('img');
    poster.alt = video.title || '';
    Promise.resolve(video.posterUrl).then((url) => url && (poster.src = url));
    const play = el('span', 'gallery-play', '▶');
    const cap = el('figcaption');
    if (video.title) cap.append(el('strong', null, video.title));
    fig.append(poster, play, cap);
    fig.addEventListener('click', async () => {
      if (fig.querySelector('video')) return;
      play.textContent = '…';
      const v = el('video');
      v.controls = true;
      v.playsInline = true;
      v.poster = poster.src;
      fig.replaceChild(v, poster);
      play.remove();
      try {
        v.src = await video.url();
        await v.play();
      } catch {
        // tapping play on the controls works too
      }
    }, { once: true });
    return fig;
  }

  #map(pinned) {
    const section = el('section', 'gallery-room gallery-map');
    section.append(el('h2', null, `📍 ${this.config.memoryMap.title}`), el('p', 'gallery-small', 'Tap a pin to see the photos from there.'));
    const canvas = el('canvas', 'gallery-map-canvas');
    section.append(canvas);
    const aspect = 16 / 11;
    const view = fitView(pinned.map(placeOf), aspect, { minSpan: 5 });
    let pins = [];
    loadWorld().then((world) => {
      const w = canvas.clientWidth || 600;
      const h = w / aspect;
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMap(g, world, view, w, h);
      pins = groupPins(pinned, view, 0.03);
      g.font = '22px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      for (const p of pins) g.fillText('📍', p.x * w, p.y * h + 4);
    }).catch(() => section.remove());
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const pin = pins.find((p) => Math.hypot((p.x - fx) * r.width, (p.y - fy) * r.height) < 26);
      if (pin) this.lightbox.open(pin.photos.map((p) => ({ photo: p })), 0);
    });
    return section;
  }
}
