/**
 * A small world map drawn on a <canvas>: countries (bundled with the site, no
 * map service or API key) in a Mercator projection, and a "view" that fits
 * around a set of pins. It's drawn like an old paper map: a soft shoreline in
 * the sea, dashed borders, country names, the countries you've been to
 * tinted, and a dashed line from place to place in the order of the photos.
 * Used by the curator's Memory map tab, the map table in the hidden last room
 * and the simple gallery — so all three show the same map.
 *
 *   const world = await loadWorld();
 *   const view = fitView(points, 16 / 10);           // points: [{ lat, lng }]
 *   drawMap(ctx, world, view, width, height, { visited: points, route });
 *   const { x, y } = project(view, lat, lng);        // 0…1 across the map
 */
const MAX_LAT = 84;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))) / 2));
const latOf = (y) => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

let worldPromise;
/**
 * The world, downloaded once — only when a map is shown: the countries
 * (rings in degrees, with a bounding box and where their name goes), the
 * coastlines and the borders between countries.
 */
export function loadWorld() {
  worldPromise ??= Promise.all([import('world-atlas/countries-50m.json'), import('topojson-client')])
    .then(([data, topo]) => {
      const topology = data.default ?? data;
      const countries = topo.feature(topology, topology.objects.countries).features
        .filter((f) => f.geometry && f.properties.name !== 'Antarctica') // it wraps the whole world; never needed here
        .map((f) => {
          const g = f.geometry;
          const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).map((poly) => poly.map(unwrap));
          const all = polys.flat(2);
          const lngs = all.map((p) => p[0]);
          const lats = all.map((p) => p[1]);
          const main = polys.map((poly) => poly[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
          return { name: f.properties.name, polys, bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], main, label: labelPoint(main) };
        });
      const lines = (mesh) => mesh.coordinates;
      return {
        countries,
        coast: lines(topo.mesh(topology, topology.objects.countries, (a, b) => a === b)),
        borders: lines(topo.mesh(topology, topology.objects.countries, (a, b) => a !== b)),
      };
    });
  return worldPromise;
}

/** A ring that crosses the date line (Russia, Fiji) continues past ±180° instead of jumping across the map. */
function unwrap(ring) {
  let shift = 0;
  return ring.map(([lng, lat], i) => {
    if (i > 0) {
      const prev = ring[i - 1][0];
      if (lng - prev > 180) shift -= 360;
      else if (prev - lng > 180) shift += 360;
    }
    return [lng + shift, lat];
  });
}

/** Area of a ring in square degrees (signed). */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** Where a country's name goes: the middle of its biggest piece, if that's inside it. */
function labelPoint(ring) {
  if (!ring) return null;
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
  }
  if (!a) return null;
  const at = [x / (3 * a), y / (3 * a)];
  return inRing(at, ring) ? { lng: at[0], lat: at[1] } : null;
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is a place inside a country? */
function inCountry(country, { lat, lng }) {
  const [x0, y0, x1, y1] = country.bbox;
  for (const l of [lng, lng + 360, lng - 360]) {
    if (l < x0 || l > x1 || lat < y0 || lat > y1) continue;
    // Even-odd over all its rings (holes included).
    if (country.polys.some((poly) => poly.filter((ring) => inRing([l, lat], ring)).length % 2 === 1)) return true;
  }
  return false;
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

/** The paper-map look. The map table in the last room uses a slightly deeper version (TABLE_STYLE). */
export const MAP_STYLE = {
  sea: '#d3e6e8', sea2: '#b6d2d8', shore: '#eef7f6', land: '#f7eed9', visited: '#f2cdd2', border: '#c4a57c',
  coast: '#8a6a49', label: '#9b8164', visitedLabel: '#8e1530', grid: 'rgba(70, 100, 110, 0.13)', route: 'rgba(142, 21, 48, 0.75)', edge: '#8a6a49',
};
export const TABLE_STYLE = {
  ...MAP_STYLE,
  sea: '#a9cdd2', sea2: '#86afba', shore: '#d4eaea', land: '#f3e4c2', visited: '#ecb6bf', border: '#ae8a5e',
  coast: '#5a3d26', label: '#8a6c4c', edge: '#4a3020',
};

/**
 * Draw the map.
 * @param opts {
 *   style    colours (MAP_STYLE / TABLE_STYLE)
 *   visited  [{ lat, lng }] — the countries with these places are tinted, and named in red
 *   route    [{ x, y }] (0…1 across the map) — a dashed line from place to place
 *   labels   country names (default true)
 *   paper    a little grain and darker edges, like old paper (the table)
 *   frame    a double line round the edge, like a printed map (else a thin one)
 * }
 */
export function drawMap(g, world, view, w, h, opts = {}) {
  const c = { ...MAP_STYLE, ...opts.style };
  const k = w / 1000; // line widths and letters grow with the canvas
  const sx = w / (view.x1 - view.x0);
  const sy = h / (view.y1 - view.y0);
  const mid = (view.x0 + view.x1) / 2;
  const X = (lng, shift) => (rad(lng) + shift - view.x0) * sx;
  const Y = (lat) => (view.y1 - mercY(lat)) * sy;
  /** The copy of the world (−360°, 0, +360°) that lies nearest the view, for a line starting at `lng`. */
  const shiftFor = (lng) => {
    let shift = 0;
    while (rad(lng) + shift - mid > Math.PI) shift -= 2 * Math.PI;
    while (mid - (rad(lng) + shift) > Math.PI) shift += 2 * Math.PI;
    return shift;
  };
  const span = deg(view.x1 - view.x0);
  const onScreen = (bbox) => {
    const shift = shiftFor((bbox[0] + bbox[2]) / 2);
    return X(bbox[2], shift) > 0 && X(bbox[0], shift) < w && Y(bbox[1]) > 0 && Y(bbox[3]) < h;
  };
  const ringsPath = (countries) => {
    const path = new Path2D();
    for (const country of countries) {
      if (!onScreen(country.bbox)) continue;
      const shift = shiftFor((country.bbox[0] + country.bbox[2]) / 2);
      for (const poly of country.polys) {
        for (const ring of poly) {
          ring.forEach(([lng, lat], i) => (i ? path.lineTo(X(lng, shift), Y(lat)) : path.moveTo(X(lng, shift), Y(lat))));
          path.closePath();
        }
      }
    }
    return path;
  };
  const linesPath = (lines) => {
    const path = new Path2D();
    for (const line of lines) {
      const shift = shiftFor(line[0][0]);
      line.forEach(([lng, lat], i) => {
        // A line that jumps across the date line: lift the pen.
        if (!i || Math.abs(lng - line[i - 1][0]) > 180) path.moveTo(X(lng, shift), Y(lat));
        else path.lineTo(X(lng, shift), Y(lat));
      });
    }
    return path;
  };

  // The sea: lighter in the middle.
  const sea = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  sea.addColorStop(0, c.sea);
  sea.addColorStop(1, c.sea2);
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);

  // Meridians and parallels at a round step.
  const step = [1, 2, 5, 10, 15, 30].find((st) => span / st <= 8) ?? 30;
  g.save();
  g.strokeStyle = c.grid;
  g.lineWidth = Math.max(0.6, k * 0.9);
  g.beginPath();
  for (let lng = Math.ceil(deg(view.x0) / step) * step; lng <= deg(view.x1); lng += step) {
    g.moveTo(X(lng, 0), 0);
    g.lineTo(X(lng, 0), h);
  }
  for (let lat = -80; lat <= 80; lat += step) {
    if (Y(lat) < 0 || Y(lat) > h) continue;
    g.moveTo(0, Y(lat));
    g.lineTo(w, Y(lat));
  }
  g.stroke();
  g.restore();

  // A soft, light shoreline in the sea (wide strokes under the land).
  const coast = linesPath(world.coast);
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = c.shore;
  for (const [width, alpha] of [[14, 0.18], [8, 0.3], [4, 0.5]]) {
    g.globalAlpha = alpha;
    g.lineWidth = Math.max(width * 0.5, width * k);
    g.stroke(coast);
  }
  g.restore();

  // The land, then the countries you've been to.
  const visited = (opts.visited ?? []).filter(Boolean);
  const been = world.countries.filter((country) => visited.some((p) => inCountry(country, p)));
  g.fillStyle = c.land;
  g.fill(ringsPath(world.countries), 'evenodd');
  if (been.length) {
    g.fillStyle = c.visited;
    g.fill(ringsPath(been), 'evenodd');
  }
  if (opts.paper) paperGrain(g, w, h);

  // Borders (dashed) and the coast.
  g.save();
  g.lineJoin = 'round';
  g.strokeStyle = c.border;
  g.lineWidth = Math.max(0.7, 1.3 * k);
  g.setLineDash([4 * Math.max(0.6, k), 3 * Math.max(0.6, k)]);
  g.stroke(linesPath(world.borders));
  g.setLineDash([]);
  g.strokeStyle = c.coast;
  g.lineWidth = Math.max(0.8, 1.6 * k);
  g.stroke(coast);
  g.restore();

  if (opts.labels !== false) drawLabels(g, world.countries, been, { X, Y, shiftFor, w, h, k, c, pins: opts.route ?? [] });
  if (opts.route?.length > 1) drawRoute(g, opts.route, w, h, k, c.route);

  if (opts.paper) {
    // Darker edges, like old paper.
    const edge = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    edge.addColorStop(0, 'rgba(60, 35, 15, 0)');
    edge.addColorStop(1, 'rgba(60, 35, 15, 0.28)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
  }
  g.strokeStyle = c.edge;
  if (opts.frame) {
    g.lineWidth = 6 * k;
    g.strokeRect(3 * k, 3 * k, w - 6 * k, h - 6 * k);
    g.lineWidth = 1.5 * k;
    g.strokeRect(14 * k, 14 * k, w - 28 * k, h - 28 * k);
  } else {
    g.lineWidth = Math.max(2, w / 400);
    g.strokeRect(0, 0, w, h);
  }
}

/** Country names, biggest countries first, never on top of each other, of a pin or of the edge. */
function drawLabels(g, countries, been, { X, Y, shiftFor, w, h, k, c, pins }) {
  const size = Math.max(9, 13 * k);
  // The pins (and their names, to the right) are already "taken".
  const placed = pins.map((p) => [p.x * w - 14 * Math.max(1, k), p.y * h - 30 * Math.max(1, k), p.x * w + 90 * Math.max(1, k), p.y * h + 6 * Math.max(1, k)]);
  const list = countries
    .filter((country) => country.label)
    .map((country) => {
      const shift = shiftFor(country.label.lng);
      const [x0, y0, x1, y1] = country.bbox;
      return { country, x: X(country.label.lng, shift), y: Y(country.label.lat), width: X(x1, shift) - X(x0, shift), height: Y(y0) - Y(y1) };
    })
    .filter((l) => l.x > 0 && l.x < w && l.y > 0 && l.y < h)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of list.slice(0, 40)) {
    const visited = been.includes(l.country);
    const name = l.country.name.toUpperCase();
    g.font = `${visited ? 700 : 600} ${size}px "EB Garamond", Georgia, serif`;
    if ('letterSpacing' in g) g.letterSpacing = `${(size * 0.14).toFixed(1)}px`;
    const tw = g.measureText(name).width;
    if (tw > l.width * 0.95 || size > l.height * 0.8) continue; // doesn't fit inside the country
    const box = [l.x - tw / 2 - 4, l.y - size / 2 - 2, l.x + tw / 2 + 4, l.y + size / 2 + 2];
    if (box[0] < 6 * k || box[1] < 6 * k || box[2] > w - 6 * k || box[3] > h - 6 * k) continue; // cut off by the edge
    if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box);
    g.fillStyle = visited ? c.visitedLabel : c.label;
    g.globalAlpha = visited ? 0.9 : 0.75;
    g.fillText(name, l.x, l.y);
  }
  g.restore();
}

/** A dashed line from place to place (gently curved, like a flight path). */
function drawRoute(g, points, w, h, k, colour) {
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1.2, 2.2 * k);
  g.lineCap = 'round';
  g.setLineDash([7 * Math.max(0.6, k), 6 * Math.max(0.6, k)]);
  g.beginPath();
  points.forEach((p, i) => {
    const x = p.x * w;
    const y = p.y * h;
    if (!i) return g.moveTo(x, y);
    const px = points[i - 1].x * w;
    const py = points[i - 1].y * h;
    // Bend to one side by a sixth of the distance.
    const mx = (px + x) / 2 + (y - py) / 6;
    const my = (py + y) / 2 - (x - px) / 6;
    g.quadraticCurveTo(mx, my, x, y);
  });
  g.stroke();
  g.restore();
}

/** A fine grain over the land and sea, like paper. */
function paperGrain(g, w, h) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save();
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(90, 60, 30, 0.07)' : 'rgba(255, 255, 255, 0.08)';
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
  g.restore();
}

/**
 * A map pin: a round head on a short needle, with a soft shadow (gold when
 * it's the chosen one), and a count if it holds several photos. `size` 1 ≈ 18 px tall.
 */
export function drawPin(g, x, y, { chosen = false, count = 1, size = 1 } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  g.fillStyle = 'rgba(40, 20, 10, 0.25)';
  g.beginPath();
  g.ellipse(3, 1, 5, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#5a4630';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -14);
  g.stroke();
  const head = g.createRadialGradient(-2.5, -20.5, 1, 0, -18, 8);
  head.addColorStop(0, chosen ? '#ffe7a3' : '#ff8a9c');
  head.addColorStop(1, chosen ? '#c8901c' : '#b3162f');
  g.fillStyle = head;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, -18, 7.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (count > 1) {
    g.fillStyle = '#fff';
    g.font = '700 9px Manrope, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(count), 0, -17.5);
  }
  g.restore();
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
