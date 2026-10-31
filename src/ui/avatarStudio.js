/**
 * The avatar studio: a big turning preview next to tabs (Body, Face, Hair…)
 * full of options — picture tiles (your own avatar wearing each option),
 * colour swatches plus any colour you like, and sliders. Used on the start
 * screen and in the in-game wardrobe.
 */
import { LOOK_OPTIONS, LOOK_LABELS, LOOK_GROUPS, COLOR_FIELDS, SLIDER_FIELDS, randomLook } from '../player/looks.js';
import { AvatarPreview } from './avatarPreview.js';

const TILE = 72; // px, a picture tile
const REACTION = { Face: 'B', Pet: 'W' }; // the little action the avatar does after a change (default ✌️)

export class AvatarStudio {
  /**
   * @param el        an empty element to build the studio in
   * @param look      the look to start from
   * @param onChange  (look) => void, after every change
   */
  constructor(el, { look, onChange = () => {} }) {
    this.el = el;
    this.look = { ...look };
    this.onChange = onChange;
    this.history = [];
    el.classList.add('studio');
    el.innerHTML = `
      <div class="studio-stage">
        <canvas class="studio-preview" aria-hidden="true"></canvas>
        <div class="studio-tools">
          <button type="button" class="studio-tool" data-tool="undo" title="Undo" aria-label="Undo" disabled>↶</button>
          <button type="button" class="studio-tool" data-tool="random" title="Surprise me" aria-label="Random look">🎲</button>
        </div>
        <p class="studio-hint" aria-hidden="true">Drag to turn</p>
      </div>
      <div class="studio-panel">
        <div class="studio-tabs" role="tablist" aria-label="Avatar"></div>
        <div class="studio-rows" role="tabpanel"></div>
      </div>`;
    this.tabs = el.querySelector('.studio-tabs');
    this.rows = el.querySelector('.studio-rows');
    this.undoButton = el.querySelector('[data-tool="undo"]');
    this.undoButton.onclick = () => this.#undo();
    el.querySelector('[data-tool="random"]').onclick = () => {
      this.#remember();
      this.look = randomLook();
      this.#changed('J');
      this.#showGroup(this.group);
    };

    const canvas = el.querySelector('.studio-preview');
    canvas.addEventListener('pointerdown', () => el.classList.add('turned'), { once: true }); // they found it: hide the hint
    try {
      this.preview = new AvatarPreview(canvas);
      this.preview.start();
      this.preview.setLook(this.look, 'W');
    } catch {
      this.preview = null; // no WebGL to spare: the options still work, as words
      el.classList.add('no-preview');
    }

    for (const group of LOOK_GROUPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-tab';
      b.setAttribute('role', 'tab');
      b.dataset.group = group.name;
      b.innerHTML = '<span class="studio-tab-icon" aria-hidden="true"></span><span class="studio-tab-name"></span>';
      b.firstChild.textContent = group.icon;
      b.lastChild.textContent = group.name;
      b.onclick = () => this.#showGroup(group);
      this.tabs.append(b);
    }
    this.#showGroup(LOOK_GROUPS[0]);
  }

  /** Free the preview's renderer. */
  dispose() {
    this.preview?.dispose();
    this.preview = null;
  }

  #showGroup(group) {
    this.group = group;
    for (const t of this.tabs.children) t.setAttribute('aria-selected', String(t.dataset.group === group.name));
    this.tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.rows.replaceChildren(...group.fields.map(([field, label, shot]) => this.#row(field, label, shot)));
    this.rows.scrollTop = 0;
    this.preview?.setView(group.view);
    this.#paintTiles();
  }

  /** One setting: a slider, colour swatches, or picture tiles. */
  #row(field, label, shot) {
    const row = document.createElement('section');
    row.className = 'studio-row';
    row.dataset.field = field;
    const title = document.createElement('h3');
    title.textContent = label;
    row.append(title);
    if (SLIDER_FIELDS[field]) row.append(this.#slider(field, label));
    else if (COLOR_FIELDS.has(field)) row.append(this.#swatches(field, label));
    else row.append(this.#tiles(field, label, shot));
    return row;
  }

  #slider(field, label) {
    const steps = LOOK_OPTIONS[field];
    const [low, high] = SLIDER_FIELDS[field];
    const wrap = document.createElement('div');
    wrap.className = 'studio-slider';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0;
    input.max = steps.length - 1;
    input.step = 1;
    input.value = Math.max(0, steps.indexOf(this.look[field]));
    input.setAttribute('aria-label', label);
    input.oninput = () => this.#set(field, steps[+input.value]);
    const [a, b] = [low, high].map((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    });
    wrap.append(a, input, b);
    return wrap;
  }

  #swatches(field, label) {
    const list = document.createElement('div');
    list.className = 'studio-swatches';
    for (const value of LOOK_OPTIONS[field]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-swatch';
      if (value === 'none') b.classList.add('is-none');
      else b.style.setProperty('--swatch', value);
      b.dataset.value = value;
      b.setAttribute('aria-label', `${label}: ${value === 'none' ? 'none' : value}`);
      b.onclick = () => this.#set(field, value);
      list.append(b);
    }
    // Any other colour (the system colour picker).
    const custom = document.createElement('label');
    custom.className = 'studio-swatch studio-custom';
    custom.title = 'Any colour';
    const input = document.createElement('input');
    input.type = 'color';
    input.setAttribute('aria-label', `${label}: pick any colour`);
    const current = this.look[field];
    input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#ff8fa3';
    let frame = 0;
    input.oninput = () => {
      // Live while dragging around the picker (one rebuild per frame at most)…
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.preview?.setLook({ ...this.look, [field]: input.value.toLowerCase() }, null));
    };
    input.onchange = () => this.#set(field, input.value.toLowerCase()); // …and kept when it's chosen.
    custom.append(input);
    list.append(custom);
    this.#markSwatches(list, field);
    return list;
  }

  #markSwatches(list, field) {
    const value = this.look[field];
    const preset = LOOK_OPTIONS[field].includes(value);
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === value));
    const custom = list.querySelector('.studio-custom');
    custom.classList.toggle('chosen', !preset);
    custom.style.setProperty('--swatch', preset ? '' : value);
  }

  #tiles(field, label, shot) {
    const list = document.createElement('div');
    list.className = 'studio-tiles';
    const names = LOOK_LABELS[field] ?? {};
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const value of LOOK_OPTIONS[field]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-tile';
      b.dataset.value = value;
      b.dataset.shot = shot;
      b.setAttribute('aria-label', `${label}: ${names[value] ?? value}`);
      b.setAttribute('aria-pressed', String(this.look[field] === value));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.round(TILE * ratio);
      canvas.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = names[value] ?? value;
      b.append(canvas, name);
      b.onclick = () => this.#set(field, value);
      list.append(b);
    }
    return list;
  }

  /** Ask the preview to paint every tile of the open tab (unchanged ones come from its cache). */
  #paintTiles() {
    if (!this.preview) return;
    for (const row of this.rows.children) {
      const field = row.dataset.field;
      for (const tile of row.querySelectorAll('.studio-tile')) {
        this.preview.thumb({ ...this.look, [field]: tile.dataset.value }, tile.dataset.shot, tile.querySelector('canvas'));
      }
    }
  }

  #set(field, value) {
    if (this.look[field] === value) return;
    this.#remember();
    this.look[field] = value;
    const row = this.rows.querySelector(`[data-field="${field}"]`);
    if (row) {
      for (const b of row.querySelectorAll('.studio-tile')) b.setAttribute('aria-pressed', String(b.dataset.value === value));
      const swatches = row.querySelector('.studio-swatches');
      if (swatches) this.#markSwatches(swatches, field);
    }
    this.#changed(REACTION[this.group.name] ?? 'V');
  }

  #changed(emote) {
    this.preview?.setLook(this.look, emote);
    this.#paintTiles();
    this.undoButton.disabled = !this.history.length;
    this.onChange({ ...this.look });
  }

  #remember() {
    this.history.push({ ...this.look });
    if (this.history.length > 40) this.history.shift();
  }

  #undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.look = previous;
    this.#changed('V');
    this.#showGroup(this.group);
  }
}
