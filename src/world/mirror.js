/**
 * The mirror: it hangs on a photo spot in an ornate golden frame. From far
 * away its glass is black. Stand in front of it and a dark mist swirls and
 * clears, showing "the thing you want the most" — one of the pictures the
 * curator chose for *you*, picked at random each time (the same one may come
 * again), or, if there are none, the two of you, really reflected.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { textTexture } from './textures.js';

const REVEAL_IN = 2.6; // seconds for the mist to clear
const REVEAL_OUT = 1.0;
const NEAR = 3.0; // metres from the wall, and within the mirror's width
const SLIDE = 6; // seconds before another (random) picture, when there are several

/** The mirror's glass: a rectangle with an arched top, `w` × `h`, centred. */
function archShape(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  const straight = h - r;
  s.moveTo(-r, -h / 2);
  s.lineTo(r, -h / 2);
  s.lineTo(r, -h / 2 + straight);
  s.absarc(0, -h / 2 + straight, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

/** Shape geometry with UVs from 0 to 1 across its bounding box. */
function shapeGeometry(shape) {
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y));
  return geo;
}

const VEIL_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uReveal;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    void main() {
      vec2 c = vUv - 0.5;
      c.x *= uAspect;
      float d = length(c);
      // Swirl: the further out, the more it turns — faster while revealing.
      float turn = (2.4 + uReveal * 5.0) * (1.0 - smoothstep(0.0, 0.8, d)) + uTime * 0.25;
      float cs = cos(turn), sn = sin(turn);
      vec2 p = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      float n = fbm(p * 3.2 + uTime * 0.12);
      // The mist clears from the middle outwards, with a ragged edge.
      float clearAt = uReveal * 1.25 - 0.15;
      float m = smoothstep(clearAt - 0.12, clearAt + 0.02, d * 0.9 + (n - 0.5) * 0.45);
      vec3 mist = mix(vec3(0.015, 0.012, 0.03), vec3(0.16, 0.1, 0.26), n * n);
      // A silvery shimmer along the clearing edge.
      float edge = smoothstep(0.1, 0.0, abs(m - 0.5)) * step(0.01, uReveal) * (1.0 - smoothstep(0.85, 1.0, uReveal));
      vec3 colour = mist + vec3(0.75, 0.8, 1.0) * edge * 0.9;
      gl_FragColor = vec4(colour, max(m, edge * 0.8));
    }`,
};

/**
 * @param plan      the floor plan (its frames include the mirror's spot)
 * @param pictures  [{ url(size), width, height }] — this visitor's pictures (may be empty)
 * @param opts { reducedMotion, renderer }
 * @returns { group, spot, current, update(dt, pos), dispose() } or null if there's no mirror
 */
export function buildMirror(plan, pictures, { reducedMotion = false, renderer } = {}) {
  const spot = plan.frames.find((f) => f.photo.isMirror);
  if (!spot) return null;
  const group = new THREE.Group();
  group.name = 'mirror';
  const w = spot.width;
  const h = spot.height;
  const holder = new THREE.Group();
  holder.position.set(spot.x, spot.y, spot.z);
  holder.rotation.y = spot.rotationY;
  group.add(holder);

  // ── Golden frame: the arch outline, a little wider, with the glass cut out ──
  const border = 0.12;
  const outer = archShape(w + border * 2, h + border * 2);
  outer.holes.push(archShape(w, h));
  const gold = new THREE.MeshPhongMaterial({ color: '#c9a04a', shininess: 90, specular: '#fff0c0' });
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 }), gold);
  holder.add(frame);
  const crest = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), gold);
  crest.position.set(0, h / 2 + border + 0.05, 0.05);
  holder.add(crest);

  const glass = shapeGeometry(archShape(w, h));
  const Z = 0.035;

  // ── What appears: this visitor's pictures, or a real reflection ──
  const loader = new THREE.TextureLoader();
  const slides = [];
  let reflector = null;
  const pick = () => Math.floor(Math.random() * pictures.length);
  let current = pictures.length ? pick() : 0;
  if (pictures.length) {
    for (const [i, pic] of pictures.entries()) {
      const mat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: i === current ? 1 : 0, toneMapped: false, depthWrite: false });
      const mesh = new THREE.Mesh(glass, mat);
      mesh.position.z = Z + i * 0.0005;
      holder.add(mesh);
      slides.push(mat);
      pic.url('lg').then((url) => loader.loadAsync(url)).then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        // Fill the glass (like object-fit: cover).
        const picAspect = (pic.width || tex.image.width) / (pic.height || tex.image.height);
        const glassAspect = w / h;
        if (picAspect > glassAspect) {
          tex.repeat.set(glassAspect / picAspect, 1);
          tex.offset.set((1 - tex.repeat.x) / 2, 0);
        } else {
          tex.repeat.set(1, picAspect / glassAspect);
          tex.offset.set(0, (1 - tex.repeat.y) / 2);
        }
        mat.map = tex;
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
      }).catch((err) => console.warn('[mirror] picture failed to load:', err.message));
    }
  } else {
    reflector = new Reflector(glass, {
      textureWidth: Math.min(1024, 512 * (renderer?.getPixelRatio() ?? 1)),
      textureHeight: Math.min(1400, 700 * (renderer?.getPixelRatio() ?? 1)),
      color: 0xb8bcc8,
      clipBias: 0.003,
    });
    reflector.position.z = Z;
    reflector.visible = false;
    holder.add(reflector);
  }

  // ── The black, swirling mist in front ──
  const veil = new THREE.Mesh(glass, new THREE.ShaderMaterial({
    ...VEIL_SHADER,
    uniforms: { uReveal: { value: 0 }, uTime: { value: 0 }, uAspect: { value: w / h } },
    transparent: true,
    depthWrite: false,
  }));
  veil.position.z = Z + 0.004;
  veil.renderOrder = 3;
  holder.add(veil);

  // A small museum label beside it.
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.21),
    new THREE.MeshLambertMaterial({
      transparent: true,
      map: textTexture([
        { text: 'The mirror', font: '600 34px Manrope, sans-serif', color: '#2b2522', gap: 6 },
        { text: 'shows the thing you want the most', font: 'italic 400 26px "EB Garamond", Georgia, serif', color: '#7b706a' },
      ], { width: 400, height: 200, padding: 12 }),
    }),
  );
  label.position.set(w / 2 + border + 0.33, -h / 2 + 0.15, 0.01);
  holder.add(label);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.23), new THREE.MeshLambertMaterial({ color: '#f7f2ea' }));
  card.position.set(label.position.x, label.position.y, 0.008);
  holder.add(card);

  let reveal = 0;
  let time = 0;
  let slideTime = 0;
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  return {
    group,
    spot,
    /** Which of the pictures shows (or would show) right now. */
    get current() {
      return current;
    },
    /** Every frame: is the visitor standing in front of it? */
    update(dt, pos) {
      time += dt;
      holder.updateMatrixWorld();
      inverse.copy(holder.matrixWorld).invert();
      local.set(pos.x, spot.y, pos.z).applyMatrix4(inverse); // the visitor, in the mirror's own space
      const near = local.z > 0.3 && local.z < NEAR && Math.abs(local.x) < w / 2 + 1.0;
      if (near && reveal === 0 && slides.length > 1) {
        // Stepping up to it: a picture at random (behind the mist, so it just appears).
        current = pick();
        slideTime = 0;
        slides.forEach((m, i) => (m.opacity = i === current ? 1 : 0));
      }
      const speed = reducedMotion ? 1.5 : 1;
      reveal = Math.max(0, Math.min(1, reveal + (near ? dt / (REVEAL_IN / speed) : -dt / REVEAL_OUT)));
      veil.material.uniforms.uReveal.value = reducedMotion ? reveal : reveal * reveal * (3 - 2 * reveal);
      veil.material.uniforms.uTime.value = reducedMotion ? 0 : time;
      if (reflector) reflector.visible = reveal > 0.01; // the reflection only costs anything while you look
      if (slides.length > 1 && reveal > 0.99) {
        slideTime += dt;
        if (slideTime > SLIDE) {
          slideTime = 0;
          current = pick(); // may be the same one again
        }
      }
      slides.forEach((m, i) => (m.opacity += ((i === current ? 1 : 0) - m.opacity) * Math.min(1, dt * 2)));
    },
    dispose() {
      reflector?.dispose();
    },
  };
}
