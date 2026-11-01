/**
 * A small world map drawn on a <canvas>: country outlines (bundled with the
 * site, no map service or API key), a Mercator projection, and a "view" that
 * fits around a set of pins. Used by the curator's Memory map tab and by the
 * map table in the hidden last room — so both show the same map.
 *
 *   const world = await loadWorld();
 *   const view = fitView(points, 16 / 10);           // points: [{ lat, lng }]
 *   drawMap(ctx, world, view, width, height);
 *   const { x, y } = project(view, lat, lng);        // 0…1 across the map
 */
const MAX_LAT = 84;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))) / 2));
const latOf = (y) => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

let worldPromise;
/** The countries (GeoJSON), downloaded once — only when a map is shown. */
export function loadWorld() {
  worldPromise ??= Promise.all([import('world-atlas/countries-50m.json'), import('topojson-client')])
    .then(([data, topo]) => {
      const topology = data.default ?? data;
      return { countries: topo.feature(topology, topology.objects.countries).features };
    });
  return worldPromise;
}

/** A photo's place, if it has one: { lat, lng } or null. */
export function placeOf(photo) {
  return Number.isFinite(photo?.lat) && Number.isFinite(photo?.lng) ? { lat: photo.lat, lng: photo.lng } : null;
}

/**
 * The part of the world to show: around all the points (with some margin),
 * never closer than `minSpan` degrees across, shaped `aspect` (width / height).
 * With no points: the whole world.
 */
export function fitView(points, aspect, { minSpan = 4, margin = 0.35 } = {}) {
  const list = points.filter(Boolean);
  if (!list.length) return viewAround(15, 0, 340, aspect);
  const xs = list.map((p) => rad(p.lng));
  const ys = list.map((p) => mercY(p.lat));
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let w = Math.max((x1 - x0) * (1 + margin * 2), rad(minSpan));
  let h = Math.max((y1 - y0) * (1 + margin * 2), w / aspect);
  w = Math.max(w, h * aspect);
  h = w / aspect;
  if (w > rad(340)) return viewAround(latOf(cy), deg(cx), 340, aspect);
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}

/** A view `span` degrees wide centred on lat/lng. */
export function viewAround(lat, lng, span, aspect) {
  const w = rad(span);
  const h = w / aspect;
  const cx = rad(lng);
  const cy = Math.max(mercY(-MAX_LAT) + h / 2, Math.min(mercY(MAX_LAT) - h / 2, mercY(lat)));
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}

/** Zoom a view by `factor` (< 1 = closer) around a point 0…1 across it. */
export function zoomView(view, factor, fx = 0.5, fy = 0.5) {
  const w = Math.min(rad(360), (view.x1 - view.x0) * factor);
  const h = (view.y1 - view.y0) * (w / (view.x1 - view.x0));
  const ax = view.x0 + (view.x1 - view.x0) * fx;
  const ay = view.y1 - (view.y1 - view.y0) * fy;
  return { x0: ax - w * fx, x1: ax + w * (1 - fx), y0: ay - h * (1 - fy), y1: ay + h * fy };
}

/** Move a view by a fraction of its size. */
export function panView(view, dx, dy) {
  const w = view.x1 - view.x0;
  const h = view.y1 - view.y0;
  return { x0: view.x0 - dx * w, x1: view.x1 - dx * w, y0: view.y0 + dy * h, y1: view.y1 + dy * h };
}

/** lat/lng → position on the map, 0…1 from the left and from the top. */
export function project(view, lat, lng) {
  let x = rad(lng);
  // Pick the copy of the world nearest the view (maps across the date line).
  const mid = (view.x0 + view.x1) / 2;
  while (x - mid > Math.PI) x -= 2 * Math.PI;
  while (mid - x > Math.PI) x += 2 * Math.PI;
  return { x: (x - view.x0) / (view.x1 - view.x0), y: (view.y1 - mercY(lat)) / (view.y1 - view.y0) };
}

/** Position on the map (0…1) → { lat, lng }. */
export function unproject(view, x, y) {
  let lng = deg(view.x0 + x * (view.x1 - view.x0));
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: latOf(view.y1 - y * (view.y1 - view.y0)), lng };
}

/**
 * Draw the map: sea, countries, a grid of meridians and parallels and a
 * thin border. `style` tweaks the colours (the 3D table is a bit warmer).
 */
export function drawMap(g, world, view, w, h, style = {}) {
  const c = { sea: '#cfe2e2', sea2: '#b9d3d6', land: '#f3e7cc', border: '#c2a47a', coast: '#9c7f55', grid: 'rgba(80, 100, 110, 0.18)', ...style };
  const sea = g.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, c.sea);
  sea.addColorStop(1, c.sea2);
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);

  // Meridians and parallels at a round step.
  const span = deg(view.x1 - view.x0);
  const step = [1, 2, 5, 10, 15, 30].find((s) => span / s <= 9) ?? 30;
  g.strokeStyle = c.grid;
  g.lineWidth = Math.max(1, w / 900);
  g.beginPath();
  const west = deg(view.x0);
  for (let lng = Math.ceil(west / step) * step; lng <= deg(view.x1); lng += step) {
    const x = ((rad(lng) - view.x0) / (view.x1 - view.x0)) * w;
    g.moveTo(x, 0);
    g.lineTo(x, h);
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const y = ((view.y1 - mercY(lat)) / (view.y1 - view.y0)) * h;
    if (y < 0 || y > h) continue;
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();

  // Countries: filled, with their borders.
  const sx = w / (view.x1 - view.x0);
  const sy = h / (view.y1 - view.y0);
  const mid = (view.x0 + view.x1) / 2;
  g.beginPath();
  for (const f of world.countries) {
    const geom = f.geometry;
    if (!geom) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        // Shift the whole ring next to the view (rings never cross the date line in this data).
        let shift = 0;
        const rx = rad(ring[0][0]);
        while (rx + shift - mid > Math.PI) shift -= 2 * Math.PI;
        while (mid - (rx + shift) > Math.PI) shift += 2 * Math.PI;
        ring.forEach(([lng, lat], i) => {
          const x = (rad(lng) + shift - view.x0) * sx;
          const y = (view.y1 - mercY(lat)) * sy;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.closePath();
      }
    }
  }
  g.fillStyle = c.land;
  g.fill('evenodd');
  g.strokeStyle = c.border;
  g.lineWidth = Math.max(0.8, w / 1400);
  g.lineJoin = 'round';
  g.stroke();

  g.strokeStyle = c.coast;
  g.lineWidth = Math.max(2, w / 400);
  g.strokeRect(0, 0, w, h);
}

/**
 * Photos that share a place, grouped: pins closer than `radius` (0…1 of the
 * map width) become one pin. Returns [{ x, y, lat, lng, photos }].
 */
export function groupPins(photos, view, radius = 0.025) {
  const pins = [];
  for (const photo of photos) {
    const at = placeOf(photo);
    if (!at) continue;
    const { x, y } = project(view, at.lat, at.lng);
    const near = pins.find((p) => Math.hypot(p.x - x, p.y - y) < radius);
    if (near) near.photos.push(photo);
    else pins.push({ x, y, ...at, photos: [photo] });
  }
  return pins;
}
