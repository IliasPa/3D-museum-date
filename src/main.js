/**
 * Entry point. The flow:
 *   1. Show a light preview of an empty museum behind the sign-in card.
 *   2. Sign in with Google → find the museum(s) this email is invited to.
 *   3. Load that couple's museum (texts, rooms, photos, song), pick a look.
 *   4. "Enter" → walk around; everyone else in the same museum appears live.
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
import { museumConfig } from './museumConfig.js';
import { Game } from './game.js';
import { Music } from './audio/music.js';
import { StartScreen } from './ui/startScreen.js';
import { Hud } from './ui/hud.js';
import { Placard } from './ui/placard.js';
import { Lightbox } from './ui/lightbox.js';
import { Letter } from './ui/letter.js';
import { loadLook, saveLook, encodeLook } from './player/looks.js';
import { watchUser, signInWithGoogle, signOutUser, signInErrorMessage, isAdminEmail, isInAppBrowser, isConfigured } from './backend/firebase.js';

const $ = (selector) => document.querySelector(selector);
const isTouch = matchMedia('(pointer: coarse)').matches;
const DEFAULT_SONG = 'audio/song.mp3';

async function boot() {
  document.documentElement.lang = CONFIG.language || 'en';
  const start = new StartScreen($('#start'), CONFIG, isTouch);
  const music = new Music(CONFIG.music, CONFIG.title);
  const hud = new Hud($('#hud'), music);
  const placard = new Placard($('#placard'), isTouch);
  const lightbox = new Lightbox($('#lightbox'));
  const letter = new Letter($('#letter'), CONFIG.finale);
  let look = loadLook();

  // 1. A light preview: the museum's rooms with blank frames (no photos downloaded).
  let game;
  try {
    game = new Game($('#scene'), $('.joystick'), CONFIG);
    await loadFonts(CONFIG, []);
    await game.setMuseum(CONFIG, previewPhotos(CONFIG), look);
    game.run();
  } catch (err) {
    console.error(err);
    start.show('none');
    start.error('Sorry — this browser couldn’t start 3D graphics (WebGL).');
    return;
  }
  if (import.meta.env.DEV) Object.assign(window, { __museum: game, __music: music }); // handy for poking around in the console

  // Connect the game to the on-screen UI.
  const galleryRooms = () => game.plan.rooms.filter((r) => !r.isFinale).length;
  game.onRoomChange = (room, index) => hud.setRoom(room, index, galleryRooms());
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

  if (!isConfigured) {
    start.show('none');
    start.error('This museum isn’t connected to Firebase yet — see README → “Firebase setup”.');
    return;
  }

  // 2. Sign-in. watchUser fires now (signed in or not) and after every change.
  let current = 0; // ignore results from an older sign-in if the account changes mid-way
  watchUser(async (user) => {
    const run = ++current;
    const stale = () => run !== current;
    start.setAccount(user, isAdminEmail(user?.email), () => signOutUser());
    if (!user) {
      start.signIn(signIn, { inAppBrowser: isInAppBrowser() });
      return;
    }
    try {
      // The database code is only downloaded once someone has signed in.
      const data = await import('./backend/museumData.js');
      start.busy('Finding your museum…');
      game.holdFrames = true; // the card covers the 3D view while loading anyway
      const museums = await data.findMuseums(user);
      if (stale()) return;
      if (!museums.length) {
        game.holdFrames = false;
        start.denied(user.email, () => signOutUser());
        return;
      }
      // Each couple has its own link (…/?m=their-name). Only museums this
      // account is invited to are ever offered — the database enforces it too.
      const params = new URLSearchParams(location.search);
      const wanted = params.get('m') ?? params.get('museum');
      let chosen = museums.find((m) => m.slug === wanted || m.id === wanted) ?? (museums.length === 1 ? museums[0] : null);
      const wrongLink = wanted && !museums.some((m) => m.slug === wanted || m.id === wanted);
      if (!chosen) {
        game.holdFrames = false;
        chosen = await start.choose(museums, wrongLink ? 'That link is for a museum you’re not invited to. Here are yours:' : undefined);
        game.holdFrames = true;
      }
      if (stale()) return;

      // 3. Load the couple's museum.
      start.busy('Opening the museum…');
      const { data: museumData, photos, videos } = await data.loadMuseum(chosen.id);
      const config = museumConfig(museumData);
      await loadFonts(config, photos);
      if (stale()) return;
      document.documentElement.lang = config.language;
      start.setTitle(config.title, config.subtitle);
      letter.setContent(config.finale);
      await game.setMuseum(config, photos, look, (loaded, total) => start.setProgress(loaded, total), videos);
      data.loadMusicUrl(chosen.id, museumData.music)
        .then((url) => music.setSource(url ?? DEFAULT_SONG))
        .catch(() => music.setSource(DEFAULT_SONG));

      // The curator can peek into any museum, but only appears to others if invited to it.
      const isGuest = !isAdminEmail(user.email) || (await data.isGuestOf(user, chosen.id));
      if (stale()) return;
      game.holdFrames = false;
      start.ready({
        look,
        note: isGuest ? '' : 'You’re visiting as the curator — others won’t see you.',
        onLookChange: (next) => {
          look = next;
          saveLook(look);
          game.setLook(look);
        },
        onEnter: () => enter(user, chosen.id, isGuest),
      });
      if (wrongLink) start.setStatus('That link was for another museum — this one is yours ♥');
      else if (!photos.length) start.setStatus('No photos here yet — add some on the curator page.');
    } catch (err) {
      if (stale()) return;
      console.error(err);
      game.holdFrames = false;
      start.signIn(signIn, { inAppBrowser: isInAppBrowser() });
      start.error(err.code === 'permission-denied'
        ? 'This account doesn’t have access to that museum.'
        : 'Couldn’t open the museum. Check your connection and try again.');
    }
  });

  async function signIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error(err);
      start.error(signInErrorMessage(err));
    }
  }

  // Actions (A–Z keys, or the 😊 menu), short hints, and videos pausing the music.
  hud.onAction = (key) => game.performAction(key);
  game.onHint = (text) => hud.showHint(text, 3500);
  game.onVideoChange = (playing, { muted } = {}) => {
    if (playing) music.pauseForVideo();
    else music.resumeAfterVideo();
    if (playing && muted) hud.showHint('Tap the screen for sound 🔊', 5000);
  };

  // 4. "Enter": start the music (must happen inside the tap for iPhone), play, meet the others.
  function enter(user, museumId, publish) {
    music.start();
    game.setSelfId(user.uid);
    game.start();
    hud.show();
    hud.showHint(isTouch
      ? 'Left thumb to walk · swipe to look around · 😊 for actions'
      : 'Arrow keys to walk · Space opens a photo · A–Z for actions (😊 lists them)');

    let presence = null;
    hud.onEmote = () => {
      game.emote();
      presence?.emote();
    };
    import('./backend/presence.js')
      .then(({ joinPresence }) => joinPresence({
        museumId,
        user,
        name: (user.displayName || user.email).split(/[\s@]/)[0],
        look: encodeLook(look),
        publish,
        getState: () => game.localState(),
        onPeople: (people) => {
          game.setPeople(people);
          hud.setPeople(people);
        },
      }))
      .then((p) => (presence = p))
      .catch((err) => console.warn('[presence] live avatars unavailable:', err.message));
  }
}

/** Blank frames for the sign-in page preview: a few per room, soft colours, no downloads. */
function previewPhotos(config) {
  const colors = ['#f3cfc8', '#cfe0d8', '#f6e1bd', '#dcd0ea', '#cadcee', '#f2d3de'];
  const shapes = [[4, 3], [3, 4], [1, 1]];
  return config.rooms.flatMap((_, r) => shapes.map(([w, h], i) => ({
    room: r + 1, width: w * 100, height: h * 100, color: colors[(r * 3 + i) % colors.length], title: '', date: '', caption: '',
  })));
}

/** Waits (max 3 s) for the web fonts, including the Greek glyphs if the texts use them. */
async function loadFonts(config, photos) {
  const sample = [
    config.title, config.subtitle, config.finale.title, config.finale.message, config.finale.signature, config.finale.doorSign,
    ...config.rooms.map((r) => r.title),
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
