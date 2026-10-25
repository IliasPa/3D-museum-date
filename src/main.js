/**
 * Entry point: loads the photo list, builds the game, and connects it to the
 * on-screen UI (start screen, room names, captions, photo viewer, letter, music).
 */
// Fonts are bundled with the site (no Google Fonts request). Both include Greek.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/500-italic.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import './style.css';

import { CONFIG } from './config.js';
import { Game } from './game.js';
import { Music } from './audio/music.js';
import { StartScreen } from './ui/startScreen.js';
import { Hud } from './ui/hud.js';
import { Placard } from './ui/placard.js';
import { Lightbox } from './ui/lightbox.js';
import { Letter } from './ui/letter.js';

const $ = (selector) => document.querySelector(selector);
const isTouch = matchMedia('(pointer: coarse)').matches;

async function boot() {
  document.documentElement.lang = CONFIG.language || 'en';
  const start = new StartScreen($('#start'), CONFIG, isTouch);
  const music = new Music(CONFIG.music, CONFIG.title);
  const hud = new Hud($('#hud'), music);
  const placard = new Placard($('#placard'), isTouch);
  const lightbox = new Lightbox($('#lightbox'));
  const letter = new Letter($('#letter'), CONFIG.finale);

  // 1. The photo list (generated from photos/photos.json by scripts/photos.mjs).
  let photos;
  try {
    const res = await fetch('gallery/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    photos = (await res.json()).photos;
  } catch (err) {
    console.error(err);
    start.error('Couldn’t load the photos. Start the site with “npm run dev” — opening index.html directly doesn’t work.');
    return;
  }

  // 2. Canvas text (signs, labels, the letter) needs the fonts loaded first.
  await loadFonts(photos);

  // 3. Build the 3D museum.
  let game;
  try {
    game = await Game.create($('#scene'), $('.joystick'), CONFIG, photos, (loaded, total) => start.setProgress(loaded, total));
  } catch (err) {
    console.error(err);
    start.error('Sorry — this browser couldn’t start 3D graphics (WebGL).');
    return;
  }
  game.run();
  if (import.meta.env.DEV) window.__museum = game; // handy for poking around in the console

  // 4. Connect the game to the UI.
  const galleryRooms = game.plan.rooms.filter((r) => !r.isFinale).length;
  game.onRoomChange = (room, index) => hud.setRoom(room, index, galleryRooms);
  game.onFocusChange = (item) => (item && !lightbox.isOpen ? placard.show(item) : placard.hide());
  game.onFinaleNear = (near) => letter.setNear(near);
  game.onOpenPhoto = (item) => {
    const list = game.photosInRoomOf(item);
    placard.hide();
    game.setPaused(true);
    document.body.classList.add('viewing');
    lightbox.open(list, list.indexOf(item));
  };
  placard.onOpen = (item) => game.onOpenPhoto(item);
  lightbox.onClose = () => {
    document.body.classList.remove('viewing');
    game.setPaused(false);
    if (game.focus) placard.show(game.focus);
  };

  if (!photos.length) start.setStatus('No photos yet — add some to photos/photos.json');

  // 5. "Enter": start the music (must happen inside the tap for iPhone) and play.
  start.ready(() => {
    music.start();
    game.start();
    hud.show();
    hud.showHint(isTouch
      ? 'Left thumb to walk · swipe to look around'
      : 'WASD / arrows to walk · Shift to run · drag to look around');
  });
}

/** Waits (max 3 s) for the web fonts, including the Greek glyphs if the texts use them. */
async function loadFonts(photos) {
  const sample = [
    CONFIG.title, CONFIG.subtitle, CONFIG.finale.title, CONFIG.finale.message, CONFIG.finale.signature, CONFIG.finale.doorSign,
    ...CONFIG.rooms.map((r) => r.title),
    ...photos.map((p) => `${p.title} ${p.date}`),
  ].join(' ');
  const faces = ['500 64px "EB Garamond"', 'italic 400 64px "EB Garamond"', 'italic 500 64px "EB Garamond"', '400 32px Manrope', '600 32px Manrope'];
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, sample))), timeout]);
  } catch {
    // Fall back to system fonts — not worth failing over.
  }
}

boot();
