/**
 * Turns a photo file (JPG, PNG, WebP or iPhone HEIC, any size) into the small
 * JPEGs the museum uses — all inside the browser, no server needed.
 *
 *   md     1024 px long edge, ≤ 450 KB   (texture on the wall)
 *   lg     1600 px long edge, ≤ 950 KB   (full-screen view; must fit a 1 MB database document)
 *   thumb   240 px long edge             (curator page + floor plan)
 *
 * Re-encoding also strips the camera/GPS metadata, and the phone's rotation
 * (EXIF orientation) is applied by the browser while decoding.
 */
const SIZES = {
  md: { edge: 1024, quality: 0.82, maxBytes: 450_000 },
  lg: { edge: 1600, quality: 0.85, maxBytes: 950_000 },
  thumb: { edge: 240, quality: 0.72, maxBytes: 40_000 },
};

export async function processImage(file) {
  const bitmap = await decode(file);
  try {
    const md = await encode(bitmap, SIZES.md);
    const lg = await encode(bitmap, SIZES.lg);
    const thumb = await encode(bitmap, SIZES.thumb);
    return { md: md.bytes, lg: lg.bytes, thumb: thumb.bytes, width: md.width, height: md.height, color: averageColor(bitmap) };
  } finally {
    bitmap.close?.();
  }
}

export function isHeic(file) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** A nice default title from a file name: "IMG_1234.HEIC" → "", "first-date.jpg" → "first date". */
export function titleFromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  if (/^(img|dsc|pxl|photo|image|screenshot)[\s_-]?\d+/i.test(base)) return '';
  return base.replace(/[-_]+/g, ' ').trim();
}

async function decode(file) {
  try {
    return await createImageBitmap(file); // also applies the phone's rotation
  } catch (err) {
    // Chrome/Firefox can't read HEIC; Safari can. Load a decoder only when needed.
    if (isHeic(file)) {
      const { heicTo } = await import('heic-to');
      return heicTo({ blob: file, type: 'bitmap' });
    }
    throw new Error(`can’t read this image (${file.type || 'unknown type'})`);
  }
}

async function encode(bitmap, { edge, quality, maxBytes }) {
  let scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  let q = quality;
  for (;;) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff'; // transparent PNGs get a white background
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
    if (blob.size <= maxBytes) return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
    // Too big: lower the quality a little, then the size.
    if (q > 0.6) q -= 0.08;
    else scale *= 0.85;
  }
}

function averageColor(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d');
  g.drawImage(bitmap, 0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return `#${[r, gr, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
