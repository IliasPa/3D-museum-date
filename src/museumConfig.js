/**
 * Settings for one museum = the shared defaults in config.js + what the
 * curator set for that couple in /admin (title, rooms, message…).
 */
import { CONFIG } from './config.js';

export function museumConfig(data = {}) {
  return {
    ...CONFIG,
    title: data.title || CONFIG.title,
    subtitle: data.subtitle ?? CONFIG.subtitle,
    language: data.language || CONFIG.language,
    rooms: Array.isArray(data.rooms) && data.rooms.length ? data.rooms : CONFIG.rooms,
    finale: { ...CONFIG.finale, ...(data.finale ?? {}) },
  };
}

/** What a brand-new museum starts with (the curator edits it in /admin). */
export function newMuseumData(name) {
  return {
    name,
    title: CONFIG.title,
    subtitle: CONFIG.subtitle,
    language: CONFIG.language,
    rooms: CONFIG.rooms.map((r) => ({ ...r })),
    finale: { ...CONFIG.finale },
    music: null,
  };
}
