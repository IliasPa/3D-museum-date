/**
 * Golden dust motes drifting in the air. All the motion happens on the GPU,
 * so it costs almost nothing.
 */
import * as THREE from 'three';
import { WALL_HEIGHT as H } from './layout.js';
import { seededRandom } from './textures.js';

const PER_ROOM = 70;

export function buildDust(plan) {
  const rand = seededRandom(9);
  const positions = [];
  const seeds = [];
  for (const room of plan.rooms) {
    for (let i = 0; i < PER_ROOM; i++) {
      positions.push(room.x0 + 0.5 + rand() * (room.width - 1), rand() * H, room.z0 + 0.5 + rand() * (room.depth - 1));
      seeds.push(rand());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: 1 },
      color: { value: new THREE.Color('#ffd9a0') },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float pixelRatio;
      attribute float seed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + time * (0.04 + seed * 0.05), ${H.toFixed(1)} - 0.3) + 0.15;
        p.x += sin(time * 0.3 + seed * 40.0) * 0.35;
        p.z += cos(time * 0.23 + seed * 25.0) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + seed * 3.0) * pixelRatio * (6.0 / max(-mv.z, 0.5));
        vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(time * 1.3 + seed * 60.0))) * smoothstep(14.0, 4.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.55;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return {
    object: points,
    update(dt, pixelRatio) {
      material.uniforms.time.value += dt;
      material.uniforms.pixelRatio.value = pixelRatio;
    },
  };
}
