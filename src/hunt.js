/**
 * The key hunt, shared by the curator page and the museum: little things
 * (keys, hearts, stars…) hidden inside the photos. Finding them all opens the
 * curtain to the last room (if the curator chose that).
 */
export const HUNT_SHAPES = {
  key: { emoji: '🔑', label: 'Keys', one: 'key' },
  heart: { emoji: '💗', label: 'Hearts', one: 'heart' },
  star: { emoji: '⭐', label: 'Stars', one: 'star' },
  ring: { emoji: '💍', label: 'Rings', one: 'ring' },
  flower: { emoji: '🌸', label: 'Flowers', one: 'flower' },
  shell: { emoji: '🐚', label: 'Shells', one: 'shell' },
};

export const shapeOf = (hunt) => HUNT_SHAPES[hunt?.shape] ?? HUNT_SHAPES.key;

/** The keys that are really hidden: on a photo that still exists. */
export function hiddenKeys(hunt, photos) {
  const ids = new Set(photos.map((p) => p.id));
  return (hunt?.keys ?? []).filter((k) => ids.has(k.photo));
}

/** "5 keys", "1 heart". */
export function countLabel(hunt, n) {
  const s = shapeOf(hunt);
  return `${n} ${n === 1 ? s.one : s.label.toLowerCase()}`;
}
