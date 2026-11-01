/**
 * The "Key hunt" tab: switch the hunt on, choose how many and what shape, and
 * hide them inside the photos. Below the settings: every photo; the big key at
 * the top right of the settings is where keys come from (drag one onto a
 * photo) and where they go back (drag one onto it to take it out of the
 * photo). The page scrolls by itself when a key is dragged near its top or
 * bottom edge. A click on a photo shows it big — its keys can still be moved
 * there. The guests hunt together: a key either one finds is found for both.
 */
import { HUNT_SHAPES, shapeOf, hiddenKeys, countLabel } from '../hunt.js';
import { museumConfig } from '../museumConfig.js';
import { openZoom, zoomOpen } from './zoom.js';

const $ = (selector, root = document) => root.querySelector(selector);
const MAX_KEYS = 30;

/**
 * @param panel  the tab's element
 * @param ctx {
 *   museum()            the museum being edited
 *   photos()            its photos, in walking order
 *   save(patch)         save fields of the museum (Promise)
 *   toast(text, ms)
 *   thumbUrl(photo)     small picture (object URL)
 *   imageUrl(photo, size)  promise of the 'md' / 'lg' picture
 *   finds()             promise of Map keyId → { by, t } (the guests' finds so far — `by` is who found it)
 *   resetFinds()        hide everything again for the guests
 *   onChange()          the keys moved (the Preview shows them too)
 * }
 */
export function createHuntTab(panel, ctx) {
  const form = $('.hunt-settings', panel);
  const grid = $('.hunt-grid', panel);
  const source = $('.key-source', panel);
  const status = $('.hunt-status', panel);
  const shapes = $('.hunt-shapes', panel);
  let drag = null;
  let saving = Promise.resolve();

  const hunt = () => museumConfig(ctx.museum()).hunt;
  const keys = () => hiddenKeys(hunt(), ctx.photos());

  /** Save the hunt (a copy with `patch`), in order, and refresh what shows it. */
  function update(patch) {
    const museum = ctx.museum();
    const next = { ...hunt(), ...patch };
    museum.hunt = next;
    render();
    ctx.onChange();
    saving = saving.then(() => ctx.save(museum, { hunt: next })).catch((err) => {
      console.error(err);
      ctx.toast('Couldn’t save the key hunt — please try again.');
    });
  }

  // ── Settings ──
  for (const [id, s] of Object.entries(HUNT_SHAPES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hunt-shape';
    b.dataset.shape = id;
    b.innerHTML = '<span class="hunt-shape-emoji"></span><span></span>';
    b.firstChild.textContent = s.emoji;
    b.lastChild.textContent = s.label;
    b.addEventListener('click', () => update({ shape: id }));
    shapes.append(b);
  }
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => {
    const f = form.elements;
    if (e.target === f.count) {
      const placed = keys().length;
      let n = Math.round(Number(f.count.value) || 1);
      n = Math.max(1, Math.min(MAX_KEYS, n));
      if (n < placed) {
        n = placed;
        ctx.toast(`${countLabel(hunt(), placed)} are hidden already — drag some back onto the big ${shapeOf(hunt()).one} first.`, 5000);
      }
      f.count.value = n;
      return update({ count: n });
    }
    update({ enabled: f.enabled.checked, obvious: f.obvious.checked, locks: f.locks.checked });
  });
  $('.hunt-random', panel).addEventListener('click', () => {
    const photos = ctx.photos();
    if (!photos.length) return ctx.toast('Add some photos first (Preview tab).');
    const list = [...keys()];
    const free = () => photos.filter((p) => !list.some((k) => k.photo === p.id));
    while (list.length < hunt().count) {
      const pool = free().length ? free() : photos;
      const photo = pool[Math.floor(Math.random() * pool.length)];
      list.push({ id: newId(), photo: photo.id, x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7 });
    }
    update({ keys: list });
  });
  $('.hunt-reset', panel).addEventListener('click', async () => {
    if (!confirm('Hide every key again? The guests start the hunt from the beginning.')) return;
    await ctx.resetFinds();
    ctx.toast('Every key is hidden again ♥');
    renderStatus();
  });

  // ── Dragging keys: from the big key onto a photo, between photos, or back ──
  source.addEventListener('pointerdown', (e) => startDrag(e, null));

  function startDrag(e, key) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!key && keys().length >= hunt().count) {
      ctx.toast(`All ${countLabel(hunt(), hunt().count)} are hidden. Raise “How many” to hide more.`, 4500);
      return;
    }
    drag = { key, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp, { once: true });
    addEventListener('pointercancel', onCancel, { once: true });
  }

  function onMove(e) {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'key-ghost';
      drag.ghost.textContent = shapeOf(hunt()).emoji;
      document.body.append(drag.ghost);
      document.body.classList.add('dragging-key');
      requestAnimationFrame(edgeScroll);
      if (drag.key) document.querySelectorAll(`.hunt-key[data-key="${drag.key.id}"]`).forEach((n) => n.classList.add('lifted'));
    }
    drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    updateOver(e.clientX, e.clientY);
  }

  /**
   * Resting near the top or bottom of the window while dragging scrolls the
   * page (to reach far photos, or the big key). Only after a moment there,
   * so passing through the edge to drop on a photo doesn't move the page.
   */
  function edgeScroll(now) {
    if (!drag?.moved || zoomOpen()) return;
    const edge = 70;
    const speed = drag.y < edge ? -(edge - drag.y) / 4 : drag.y > innerHeight - edge ? (drag.y - (innerHeight - edge)) / 4 : 0;
    if (!speed) drag.edgeSince = null;
    else if ((drag.edgeSince ??= now) < now - 350) {
      scrollBy(0, speed);
      updateOver(drag.x, drag.y);
    }
    requestAnimationFrame(edgeScroll);
  }

  function updateOver(x, y) {
    const over = dropTarget(x, y);
    if (over !== drag.over) {
      drag.over?.classList.remove('key-over');
      over?.classList.add('key-over');
      drag.over = over;
    }
  }

  function onUp(e) {
    const d = drag;
    finish();
    if (!d?.moved) return;
    const target = dropTarget(e.clientX, e.clientY);
    const list = keys().filter((k) => k !== d.key);
    if (target?.classList.contains('key-source')) {
      if (d.key) update({ keys: list }); // back in the box
      return;
    }
    if (!target) return; // dropped somewhere else: it stays where it was
    const img = $('img', target);
    const r = img.getBoundingClientRect();
    const x = Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width));
    const y = Math.max(0.04, Math.min(0.96, (e.clientY - r.top) / r.height));
    list.push({ id: d.key?.id ?? newId(), photo: target.dataset.photo, x: round(x), y: round(y) });
    update({ keys: list });
  }

  function onCancel() {
    finish();
  }

  function finish() {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
    drag?.ghost?.remove();
    drag?.over?.classList.remove('key-over');
    document.body.classList.remove('dragging-key');
    document.querySelectorAll('.hunt-key.lifted').forEach((n) => n.classList.remove('lifted'));
    drag = null;
  }

  /** A photo (or the big key) under the pointer. */
  function dropTarget(x, y) {
    const under = document.elementFromPoint(x, y);
    const zoomed = zoomOpen();
    const el = under?.closest('.key-photo, .key-source');
    if (!el) return null;
    if (zoomed && !el.closest('.zoom')) return null; // only the big picture while it's open
    return el;
  }

  // ── Drawing ──
  function render() {
    const h = hunt();
    const f = form.elements;
    f.enabled.checked = h.enabled;
    f.obvious.checked = h.obvious;
    f.locks.checked = h.locks;
    if (document.activeElement !== f.count) f.count.value = h.count;
    for (const b of shapes.children) b.setAttribute('aria-pressed', String(b.dataset.shape === h.shape));
    const emoji = shapeOf(h).emoji;
    const left = Math.max(0, h.count - keys().length);
    for (const s of document.querySelectorAll('.key-source')) {
      $('.key-source-emoji', s).textContent = emoji;
      $('.key-source-count', s).textContent = left ? `${left} to hide` : 'all hidden';
      s.classList.toggle('empty', left === 0);
    }
    panel.classList.toggle('hunt-off', !h.enabled);
    $('.hunt-locks-note', panel).hidden = museumConfig(ctx.museum()).finale.enabled;

    const photos = ctx.photos();
    $('.hunt-empty', panel).hidden = photos.length > 0;
    grid.replaceChildren(...photos.map((photo) => tile(photo, emoji)));
    const frame = document.querySelector('.zoom .key-photo');
    if (frame) paintKeys(frame, keys().filter((k) => k.photo === frame.dataset.photo), emoji, startDrag);
    renderStatus();
  }

  function tile(photo, emoji) {
    const fig = document.createElement('figure');
    fig.className = 'hunt-photo';
    const wrap = document.createElement('div');
    wrap.className = 'key-photo';
    wrap.dataset.photo = photo.id;
    const img = new Image();
    img.alt = photo.title || '';
    img.draggable = false;
    img.src = ctx.thumbUrl(photo);
    wrap.append(img);
    paintKeys(wrap, keys().filter((k) => k.photo === photo.id), emoji, startDrag);
    const cap = document.createElement('figcaption');
    cap.textContent = `${photo.order ?? ''}${photo.title ? ` · ${photo.title}` : ''}`;
    fig.append(wrap, cap);
    wrap.addEventListener('click', () => zoom(photo));
    return fig;
  }

  function zoom(photo) {
    openZoom({
      lowSrc: ctx.thumbUrl(photo),
      src: ctx.imageUrl(photo, 'lg'),
      text: 'Drag a key to move it · drag it onto the big key to take it out · drag one from the big key to hide another',
      decorate: (frame) => {
        frame.classList.add('key-photo');
        frame.dataset.photo = photo.id;
        paintKeys(frame, keys().filter((k) => k.photo === photo.id), shapeOf(hunt()).emoji, startDrag);
        const box = source.cloneNode(true); // a big key on the zoomed picture too
        box.classList.add('zoom-source');
        box.addEventListener('pointerdown', (e) => startDrag(e, null));
        document.querySelector('.zoom').append(box);
      },
      onClose: () => document.querySelector('.zoom-source')?.remove(),
    });
    render();
  }

  let statusToken = 0;
  async function renderStatus() {
    const token = ++statusToken;
    const h = hunt();
    const n = keys().length;
    const parts = [`${countLabel(h, n)} hidden of ${h.count}`];
    status.textContent = parts.join(' · ');
    try {
      const finds = await ctx.finds();
      if (token !== statusToken) return;
      const found = keys().filter((k) => finds.has(k.id));
      if (found.length) {
        // Found together — and by whom.
        const by = new Map();
        for (const k of found) {
          const name = finds.get(k.id)?.by || 'someone';
          by.set(name, (by.get(name) ?? 0) + 1);
        }
        parts.push(`found together: ${found.length} (${[...by].map(([name, n]) => `${name} ${n}`).join(', ')})`);
      }
      status.textContent = parts.join(' · ');
      for (const n of document.querySelectorAll('.hunt-key')) n.classList.toggle('found', finds.has(n.dataset.key));
      $('.hunt-reset', panel).hidden = !finds.size;
    } catch {
      // can't read the finds right now: just show what's hidden
    }
  }

  return { render };
}

/**
 * Draw keys on a photo (`wrap` holds the <img>; positions are % of it).
 * With `onDown`, they can be dragged.
 */
export function paintKeys(wrap, keys, emoji, onDown = null) {
  wrap.querySelectorAll('.hunt-key').forEach((n) => n.remove());
  for (const k of keys) {
    const s = document.createElement('span');
    s.className = `hunt-key${onDown ? '' : ' readonly'}`;
    s.dataset.key = k.id;
    s.textContent = emoji;
    s.style.left = `${k.x * 100}%`;
    s.style.top = `${k.y * 100}%`;
    if (onDown) {
      s.title = 'Drag to move it';
      s.addEventListener('pointerdown', (e) => onDown(e, k));
      s.addEventListener('click', (e) => e.stopPropagation());
    }
    wrap.append(s);
  }
}

const round = (v) => Math.round(v * 1000) / 1000;
const newId = () => Math.random().toString(36).slice(2, 10);
