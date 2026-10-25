/**
 * Procedural textures drawn on <canvas> — no image files to download.
 */
import * as THREE from 'three';

/** Tiny seeded random generator so the textures look the same every visit. */
export function seededRandom(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { srgb = true, repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Warm oak planks. One tile = 8 planks; it repeats seamlessly in both directions.
 */
export function woodFloorTexture() {
  const size = 1024;
  const [c, g] = canvas(size);
  const rand = seededRandom(11);
  const rows = 8;
  const rh = size / rows;

  for (let row = 0; row < rows; row++) {
    const y = row * rh;
    // 2–3 boards per row, joints at random places (wrapping around the tile edge).
    const joints = [rand() * size];
    const count = 2 + Math.floor(rand() * 2);
    for (let k = 1; k < count; k++) joints.push(joints[0] + (k * size) / count + (rand() - 0.5) * 120);

    joints.forEach((start, k) => {
      const end = k + 1 < joints.length ? joints[k + 1] : joints[0] + size;
      const hue = 28 + rand() * 6;
      const sat = 30 + rand() * 9;
      const light = 47 + rand() * 7;
      const seed = rand() * 1000;
      // Draw the board, split at the tile edge so it wraps seamlessly.
      for (const shift of [0, -size]) {
        const x0 = start + shift;
        const x1 = end + shift;
        if (x1 < 0 || x0 > size) continue;
        g.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
        g.fillRect(x0, y, x1 - x0, rh);
        // Grain: faint wavy lines (periodic in x, so the wrap stays invisible).
        for (let line = 0; line < 16; line++) {
          const ly = y + 3 + ((line * 37 + seed) % (rh - 6));
          g.strokeStyle = `rgba(70, 40, 20, ${0.03 + ((line * 13 + seed) % 10) / 160})`;
          g.lineWidth = 1 + (line % 3);
          g.beginPath();
          for (let x = Math.max(0, x0); x <= Math.min(size, x1); x += 16) {
            const wave = Math.sin(((x + seed) / size) * Math.PI * 2 * (2 + (line % 3))) * 2.2;
            if (x === Math.max(0, x0)) g.moveTo(x, ly + wave);
            else g.lineTo(x, ly + wave);
          }
          g.stroke();
        }
        // Board end joint.
        g.fillStyle = 'rgba(50, 28, 12, 0.4)';
        g.fillRect(x0, y, 2, rh);
      }
    });
    // Gap between rows, with a soft highlight under it.
    g.fillStyle = 'rgba(45, 24, 10, 0.45)';
    g.fillRect(0, y, size, 3);
    g.fillStyle = 'rgba(255, 220, 180, 0.07)';
    g.fillRect(0, y + 3, size, 2);
  }
  return finish(c, { repeat: true });
}

/** Very subtle plaster noise, multiplied with each room's wall colour. */
export function plasterTexture() {
  const size = 256;
  const [c, g] = canvas(size);
  const rand = seededRandom(3);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 238 + rand() * 17;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return finish(c, { repeat: true });
}

/**
 * Soft radial gradient (white centre → transparent edge).
 * Used for spotlight glows on walls and the avatar's blob shadow.
 */
export function radialGlowTexture(inner = 0, stops = [[0, 1], [0.45, 0.45], [1, 0]]) {
  const size = 256;
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
  for (const [at, alpha] of stops) grad.addColorStop(at, `rgba(255,255,255,${alpha})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return finish(c, { srgb: false });
}

/** Gradient along a beam: bright at the lamp, fading out towards the wall. */
export function beamTexture() {
  const [c, g] = canvas(16, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 128);
  return finish(c, { srgb: false });
}

/** Splits text into lines that fit maxWidth (keeps the user's own line breaks). */
export function wrapText(g, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const test = `${line} ${word}`;
      if (g.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Text drawn on a transparent canvas, e.g. signs painted on walls.
 * `blocks` is a list of { text, font, color, gap } drawn top to bottom, centred.
 */
export function textTexture(blocks, { width = 1024, height = 256, padding = 24 } = {}) {
  const [c, g] = canvas(width, height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Measure all lines first, so the whole block can be centred vertically.
  const laid = blocks.map((b) => {
    g.font = b.font;
    const size = parseFloat(b.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 32);
    const lines = wrapText(g, b.text, width - padding * 2);
    return { ...b, lines, lineHeight: size * (b.lineHeight ?? 1.25) };
  });
  const total = laid.reduce((sum, b) => sum + b.lines.length * b.lineHeight + (b.gap ?? 0), 0);
  let y = (height - total) / 2;
  for (const b of laid) {
    g.font = b.font;
    g.fillStyle = b.color;
    if (b.letterSpacing && 'letterSpacing' in g) g.letterSpacing = b.letterSpacing;
    for (const line of b.lines) {
      g.fillText(line, width / 2, y + b.lineHeight / 2);
      y += b.lineHeight;
    }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    y += b.gap ?? 0;
  }
  const tex = finish(c);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Remaps a BoxGeometry's UVs to world-space metres so tiling textures keep
 * the same scale on long and short walls. `scale` = metres per texture tile.
 */
export function worldSpaceUVs(geometry, scale) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    if (ay > 0.5) uv.setXY(i, x / scale, z / scale);
    else if (ax > 0.5) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
  return geometry;
}
