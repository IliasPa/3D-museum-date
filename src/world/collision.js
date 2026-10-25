/**
 * Collision helpers. The museum is made of axis-aligned boxes
 * {minX, maxX, minY, maxY, minZ, maxZ}, which keeps these checks tiny and fast.
 */

/**
 * Pushes a circle (the avatar's footprint, seen from above) out of every box
 * it overlaps. Sliding along walls falls out of this naturally.
 * Boxes entirely above `height` (door lintels, the ceiling) are ignored.
 */
export function resolveCircle(pos, radius, colliders, height) {
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const b of colliders) {
      if (b.minY >= height) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (radius - d);
        pos.z += (dz / d) * (radius - d);
      } else {
        // Centre is inside the box: leave by the nearest side.
        const exits = [
          [pos.x - b.minX, () => (pos.x = b.minX - radius)],
          [b.maxX - pos.x, () => (pos.x = b.maxX + radius)],
          [pos.z - b.minZ, () => (pos.z = b.minZ - radius)],
          [b.maxZ - pos.z, () => (pos.z = b.maxZ + radius)],
        ];
        exits.sort((a, c) => a[0] - c[0])[0][1]();
      }
      pushed = true;
    }
    if (!pushed) break;
  }
}

/**
 * Distance along a ray (origin + dir·t) to the first box it hits, up to
 * maxDist. Boxes are grown by `pad`. Boxes containing the origin are skipped.
 */
export function raycastBoxes(origin, dir, maxDist, colliders, pad = 0) {
  let best = maxDist;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  for (const b of colliders) {
    const lo = [b.minX - pad, b.minY - pad, b.minZ - pad];
    const hi = [b.maxX + pad, b.maxY + pad, b.maxZ + pad];
    if (o[0] > lo[0] && o[0] < hi[0] && o[1] > lo[1] && o[1] < hi[1] && o[2] > lo[2] && o[2] < hi[2]) continue;
    let tMin = 0;
    let tMax = best;
    let hit = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) {
          hit = false;
          break;
        }
        continue;
      }
      let t1 = (lo[a] - o[a]) / d[a];
      let t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        hit = false;
        break;
      }
    }
    if (hit && tMin < best) best = tMin;
  }
  return best;
}
