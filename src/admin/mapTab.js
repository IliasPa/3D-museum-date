/**
 * The "Memory map" tab: where each photo was taken. New photos bring their
 * place along (from the phone's location data); here the curator can check
 * them, name the places, put a pin on the map by hand or remove one. The
 * pins show on the map table in the hidden last room.
 */
import { loadWorld, fitView, drawMap, project, unproject, zoomView, panView, placeOf, groupPins } from '../map/worldMap.js';
import { museumConfig } from '../museumConfig.js';

const $ = (selector, root = document) => root.querySelector(selector);
const ASPECT = 16 / 10;

/**
 * @param panel the tab's element
 * @param ctx {
 *   museum(), photos(), thumbUrl(photo),
 *   savePhoto(photo, patch)   Promise
 *   saveMuseum(museum, patch) Promise
 *   toast(text, ms)
 * }
 */
export function createMapTab(panel, ctx) {
  const canvas = $('.map-canvas', panel);
  const list = $('.map-list', panel);
  const form = $('.map-settings', panel);
  let world = null;
  let view = null;
  let selected = null; // the photo whose pin you're placing
  let viewFor = null; // the museum the view was fitted to

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => {
    const museum = ctx.museum();
    const next = { ...museumConfig(museum).memoryMap, enabled: form.elements.enabled.checked, title: form.elements.title.value.trim() };
    museum.memoryMap = next;
    ctx.saveMuseum(museum, { memoryMap: next }).catch(() => ctx.toast('Couldn’t save — please try again.'));
  });

  // ── The map: drag to move, wheel / + − to zoom, click to place the selected photo ──
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !view) return;
    canvas.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, view, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - down.x) / r.width;
    const dy = (e.clientY - down.y) / r.height;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
    down.moved = true;
    canvas.classList.add('panning');
    view = panView(down.view, dx, dy);
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    canvas.classList.remove('panning');
    if (!d || d.moved) return;
    const r = canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (selected) return setPlace(selected, unproject(view, fx, fy));
    // No photo chosen: a click on a pin picks its photo.
    const pin = groupPins(ctx.photos(), view).find((p) => Math.hypot((p.x - fx) * r.width, (p.y - fy) * r.height) < 14);
    if (pin) select(pin.photos[0]);
  });
  canvas.addEventListener('wheel', (e) => {
    if (!view) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    view = zoomView(view, e.deltaY > 0 ? 1.18 : 1 / 1.18, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    draw();
  }, { passive: false });
  $('.map-zoom-in', panel).addEventListener('click', () => view && ((view = zoomView(view, 1 / 1.5)), draw()));
  $('.map-zoom-out', panel).addEventListener('click', () => view && ((view = zoomView(view, 1.5)), draw()));
  $('.map-fit', panel).addEventListener('click', () => fit());
  addEventListener('resize', () => !panel.hidden && draw());

  function fit() {
    view = fitView(ctx.photos().map(placeOf), ASPECT);
    draw();
  }

  async function render() {
    const config = museumConfig(ctx.museum());
    const f = form.elements;
    f.enabled.checked = config.memoryMap.enabled;
    if (document.activeElement !== f.title) f.title.value = config.memoryMap.title;
    if (selected && !ctx.photos().includes(selected)) selected = null;
    renderList();
    world ??= await loadWorld();
    if (viewFor !== ctx.museum() || !view) {
      viewFor = ctx.museum();
      fit();
    } else draw();
  }

  function draw() {
    if (!world || !view || panel.hidden) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = w / ASPECT;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(g, world, view, w, h);
    for (const pin of groupPins(ctx.photos(), view)) {
      const on = selected && pin.photos.includes(selected);
      drawPin(g, pin.x * w, pin.y * h, on, pin.photos.length);
    }
    $('.map-hint', panel).textContent = selected
      ? `Click on the map to put “${selected.title || `photo ${selected.order}`}” there.`
      : 'Choose a photo below, then click on the map to place its pin. Drag to move the map, scroll to zoom.';
  }

  function renderList() {
    const photos = ctx.photos();
    const pinned = photos.filter(placeOf).length;
    $('.map-count', panel).textContent = `${pinned} of ${photos.length} photos have a place`;
    list.replaceChildren(...photos.map((photo) => row(photo)));
  }

  function row(photo) {
    const li = document.createElement('li');
    li.className = 'map-row';
    li.classList.toggle('selected', photo === selected);
    li.dataset.id = photo.id;
    li.innerHTML = `
      <img alt="" />
      <div class="map-row-text">
        <strong class="map-row-title"></strong>
        <input name="place" placeholder="Place name, e.g. Santorini" maxlength="40" />
      </div>
      <input name="coords" class="map-coords" placeholder="no place yet" title="Latitude, longitude — paste them from Google Maps" />
      <button type="button" class="btn btn-ghost map-pick">📍 Place</button>
      <button type="button" class="icon danger map-clear" aria-label="Remove the pin" title="Remove the pin">×</button>`;
    $('img', li).src = ctx.thumbUrl(photo);
    $('.map-row-title', li).textContent = `${photo.order}. ${photo.title || 'Untitled'}`;
    $('[name="place"]', li).value = photo.place ?? '';
    const at = placeOf(photo);
    $('[name="coords"]', li).value = at ? `${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}` : '';
    $('.map-clear', li).hidden = !at;
    $('.map-pick', li).textContent = photo === selected ? 'Click the map…' : at ? '📍 Move' : '📍 Place';
    $('.map-pick', li).addEventListener('click', () => select(photo === selected ? null : photo));
    $('.map-clear', li).addEventListener('click', () => setPlace(photo, null));
    let timer;
    $('[name="place"]', li).addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => save(photo, { place: e.target.value.trim() }), 600);
    });
    $('[name="coords"]', li).addEventListener('change', (e) => {
      const m = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(e.target.value);
      if (!e.target.value.trim()) return setPlace(photo, null);
      if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) {
        ctx.toast('Write it like “37.9715, 23.7257” (latitude, longitude).');
        return;
      }
      setPlace(photo, { lat: Number(m[1]), lng: Number(m[2]) }, true);
    });
    return li;
  }

  function select(photo) {
    selected = photo;
    renderList();
    draw();
    // The map is above the list: bring it into view to click on it.
    if (photo) canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function setPlace(photo, at, recentre = false) {
    const patch = at ? { lat: Math.round(at.lat * 1e4) / 1e4, lng: Math.round(at.lng * 1e4) / 1e4 } : { lat: null, lng: null };
    selected = null;
    await save(photo, patch);
    renderList();
    if (recentre && at && view) {
      const p = project(view, at.lat, at.lng);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return fit();
    }
    draw();
  }

  async function save(photo, patch) {
    Object.assign(photo, patch);
    try {
      await ctx.savePhoto(photo, patch);
    } catch (err) {
      console.error(err);
      ctx.toast('Couldn’t save — please try again.');
    }
  }

  return { render };
}

/** A map pin: a round head on a short needle (red, gold when chosen), with a count if it holds several photos. */
function drawPin(g, x, y, on, count) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0, 0, 0, 0.18)';
  g.beginPath();
  g.ellipse(3, 1, 5, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#5a4630';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -14);
  g.stroke();
  g.fillStyle = on ? '#d9a62e' : '#c4223f';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, -18, 7, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (count > 1) {
    g.fillStyle = '#fff';
    g.font = '600 9px Manrope, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(count), 0, -17.5);
  }
  g.restore();
}
