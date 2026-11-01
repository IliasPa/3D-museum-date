/**
 * Entry point. The flow:
 *   1. Show a light preview of an empty museum behind the sign-in card.
 *   2. Sign in with Google → find the museum(s) this email is invited to.
 *   3. Load that couple's museum (texts, rooms, photos, song), pick a look.
 *   4. "Enter" → walk around; everyone else in the same museum appears live.
 *      (Phones too slow for 3D — or without WebGL — get the simple gallery.)
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
import { museumConfig, guestSettings } from './museumConfig.js';
import { shapeOf, hiddenKeys, countLabel } from './hunt.js';
import { resolveDecoration, DECORATIONS } from './seasons.js';
import { clockZones } from './world/clocks.js';
import { Game } from './game.js';
import { Music } from './audio/music.js';
import { StartScreen } from './ui/startScreen.js';
import { Hud } from './ui/hud.js';
import { Placard } from './ui/placard.js';
import { Lightbox } from './ui/lightbox.js';
import { Letter } from './ui/letter.js';
import { Film } from './ui/film.js';
import { Wardrobe } from './ui/wardrobe.js';
import { Proposal } from './ui/proposal.js';
import { Selfie } from './ui/selfie.js';
import { Gallery } from './ui/gallery.js';
import { loadLook, saveLook, encodeLook } from './player/looks.js';
import { watchUser, signInWithGoogle, signOutUser, signInErrorMessage, isAdminEmail, isInAppBrowser, isConfigured } from './backend/firebase.js';

const $ = (selector) => document.querySelector(selector);
const isTouch = matchMedia('(pointer: coarse)').matches;
const DEFAULT_SONG = 'audio/song.mp3';
const SLOW_FPS = 15; // below this on the start screen, the simple gallery is offered instead of 3D

async function boot() {
  document.documentElement.lang = CONFIG.language || 'en';
  const start = new StartScreen($('#start'), CONFIG, isTouch);
  const music = new Music(CONFIG.music, CONFIG.title);
  const hud = new Hud($('#hud'), music);
  const placard = new Placard($('#placard'), isTouch);
  const lightbox = new Lightbox($('#lightbox'));
  const letter = new Letter($('#letter'), CONFIG.finale);
  const film = new Film($('#film'));
  const wardrobe = new Wardrobe($('#wardrobe'));
  const proposal = new Proposal($('#proposal'));
  const selfie = new Selfie($('#selfie'), $('.flash'), { isTouch });
  const gallery = new Gallery($('#gallery'), lightbox);
  let look = loadLook();
  let presence = null; // live avatars (after "Enter")
  let visit = null; // what this visit is about: { user, museumId, config, isGuest, settings, … }
  let clockTimer;

  // 1. A light preview: the museum's rooms with blank frames (no photos downloaded).
  let game = null;
  try {
    game = new Game($('#scene'), $('.joystick'), CONFIG);
    await loadFonts(CONFIG, []);
    await game.setMuseum(CONFIG, previewPhotos(CONFIG), look);
    game.run();
  } catch (err) {
    console.error(err);
    game = null; // no 3D on this device: the simple gallery it is (after signing in)
  }
  if (import.meta.env.DEV) Object.assign(window, { __museum: game, __music: music, __gallery: gallery, __lightbox: lightbox }); // handy for poking around in the console

  // Connect the game to the on-screen UI.
  if (game) connectGame();

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
      if (game) game.holdFrames = true; // the card covers the 3D view while loading anyway
      const museums = await data.findMuseums(user);
      if (stale()) return;
      if (!museums.length) {
        if (game) game.holdFrames = false;
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
        if (game) game.holdFrames = false;
        chosen = await start.choose(museums, wrongLink ? 'That link is for a museum you’re not invited to. Here are yours:' : undefined);
        if (game) game.holdFrames = true;
      }
      if (stale()) return;

      // 3. Load the couple's museum.
      start.busy('Opening the museum…');
      const loaded = await data.loadMuseum(chosen.id);
      const { data: museumData, photos, videos } = loaded;
      const config = museumConfig(museumData);
      const settings = guestSettings(config, user.email);
      // The curator can peek into any museum, but only appears to others if invited to it.
      const isGuest = !isAdminEmail(user.email) || (await data.isGuestOf(user, chosen.id));
      const email = user.email.toLowerCase();
      // The mirror shows each person their own pictures (or the ones for everyone).
      const mine = loaded.mirror.filter((m) => m.for === email);
      const mirror = mine.length ? mine : loaded.mirror.filter((m) => !m.for);
      visit = { user, museumId: chosen.id, config, isGuest, settings, photos, videos, mirror, email, found: new Set() };
      await loadFonts(config, photos);
      if (stale()) return;
      document.documentElement.lang = config.language;
      document.body.classList.toggle('reduce-motion', settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
      start.setTitle(config.title, config.subtitle);
      decorateStartScreen(config);
      letter.setContent(config.finale);
      if (game) {
        game.setReducedMotion(settings.reducedMotion);
        await game.setMuseum(config, photos, look, (n, total) => start.setProgress(n, total), videos, { mirror });
      }
      data.loadMusicUrl(chosen.id, museumData.music)
        .then((url) => music.setSource(url ?? DEFAULT_SONG))
        .catch(() => music.setSource(DEFAULT_SONG));
      if (stale()) return;
      startVisitExtras(visit); // clocks, key hunt, "last visited"

      // Too slow (or no WebGL)? Then "Enter" opens the simple gallery.
      const slow = !game || game.performanceInfo.fps < SLOW_FPS || (navigator.deviceMemory && navigator.deviceMemory < 1);
      if (game) game.holdFrames = false;
      const notes = [];
      if (!isGuest) notes.push('You’re visiting as the curator — others won’t see you.');
      if (slow) notes.push(game ? 'This phone seems a bit slow for 3D, so you’ll see a simple gallery of the museum.' : 'This browser can’t show 3D, so you’ll see a simple gallery of the museum.');
      start.ready({
        look,
        note: notes.join(' '),
        onLookChange: (next) => {
          look = next;
          saveLook(look);
          game?.setLook(look);
        },
        onEnter: () => (slow ? enterGallery(slow && game ? 'This phone seemed a bit slow for 3D, so here’s the simple version.' : 'This browser can’t show 3D, so here’s the simple version.') : enter()),
      });
      if (wrongLink) start.setStatus('That link was for another museum — this one is yours ♥');
      else if (!photos.length) start.setStatus('No photos here yet — add some on the curator page.');
    } catch (err) {
      if (stale()) return;
      console.error(err);
      if (game) game.holdFrames = false;
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

  /** The start screen's floating hearts become the season's (🎃, ❄️…). */
  function decorateStartScreen(config) {
    const emoji = DECORATIONS[resolveDecoration(config.decoration)]?.emoji;
    for (const i of document.querySelectorAll('.start-hearts i')) i.textContent = emoji || '♥';
  }

  // ── Things that belong to this visit: clocks, the key hunt, "last visited" ──
  async function startVisitExtras(v) {
    const visits = await import('./backend/visits.js');
    // "I'm here" (the curator sees the last visit; the clocks see the time zone).
    if (v.isGuest) visits.recordVisit(v.museumId, v.email).catch((err) => console.warn('[visits] could not record the visit:', err.message));
    // Clocks: you, and everyone else who's been here (by time zone only) —
    // again whenever someone arrives (maybe for the first time).
    v.refreshClocks = () => visits.loadVisits(v.museumId).catch(() => new Map()).then((all) => {
      if (visit !== v) return;
      const nameOf = (email) => guestSettings(v.config, email).name || email.split('@')[0];
      const me = v.isGuest ? [{ name: v.settings.name || firstName(v.user), tz: visits.myTimeZone() }] : [];
      const others = [...all.entries()].filter(([email]) => email !== v.email).map(([email, rec]) => ({ name: nameOf(email), tz: rec.tz }));
      const people = [...me, ...others];
      game?.setClocks(clockZones(people.length ? people : [{ name: '', tz: visits.myTimeZone() }]));
    });
    v.refreshClocks();
    // The key hunt is a game for two: a key either of you finds is found for both.
    const hunt = v.config.hunt;
    const keys = hunt.enabled ? hiddenKeys(hunt, v.photos) : [];
    v.hunt = { keys, total: keys.length, emoji: shapeOf(hunt).emoji };
    lightbox.keyEmoji = v.hunt.emoji;
    lightbox.keyClass = hunt.obvious ? 'obvious' : '';
    lightbox.keysFor = (photo) => keys.filter((k) => k.photo === photo.id && !v.found.has(k.id));
    lightbox.onFindKey = (id) => findKey(id);
    if (!keys.length) {
      applyHunt();
      return;
    }
    if (v.isGuest) {
      let first = true; // the finds from before you came in aren't news
      v.huntLink = await visits.joinHunt(v.museumId, (finds) => {
        if (visit !== v) return;
        // New finds — by the other one (yours are in `found` already, even before they're saved).
        const fresh = [...finds.entries()].filter(([id]) => keys.some((k) => k.id === id) && !v.found.has(id));
        for (const [id] of fresh) v.found.add(id);
        if (!first && fresh.length && v.found.size < v.hunt.total) {
          const by = fresh.at(-1)[1]?.by || 'They';
          hud.showHint(`${by} found one! ${v.hunt.emoji} ${v.found.size} of ${v.hunt.total} — together`, 4000);
        }
        applyHunt(!first && fresh.length > 0);
        first = false;
      }, () => {
        // The database won't share the finds: each of you hunts alone (and isn't told "together").
        if (visit !== v) return;
        v.huntLink = null;
        applyHunt();
      });
    }
    applyHunt();
  }

  /** Show the hunt's state everywhere: the count, the keys, the curtain, the simple gallery. */
  function applyHunt(newFind = false) {
    const v = visit;
    if (!v?.hunt) return;
    const { total, emoji } = v.hunt;
    const found = Math.min(v.found.size, total);
    const locked = Boolean(total && v.config.hunt.locks && v.config.finale.enabled && found < total);
    const lockText = `Find all ${countLabel(v.config.hunt, total)} hidden in the photos (${found} so far)`;
    hud.setHunt(total ? found : null, total || null, emoji, Boolean(v.huntLink));
    game?.setHunt(v.found, { locked, lockText });
    lightbox.refreshKeys();
    gallery.setHunt(total ? { found, total, emoji, locked, lockText } : null);
    if (newFind && found >= total && total) {
      const all = `You found all ${countLabel(v.config.hunt, total)} together!`;
      hud.showHint(v.config.finale.enabled && v.config.hunt.locks ? `${all} The curtain is open ♥` : `${all} ♥`, 6000);
      game?.emote();
    }
  }

  function findKey(id) {
    const v = visit;
    if (!v || v.found.has(id)) return;
    v.found.add(id);
    v.huntLink?.found(id, v.settings.name || firstName(v.user));
    const n = v.found.size;
    if (n < v.hunt.total) hud.showHint(`You found one! ${v.hunt.emoji} ${n} of ${v.hunt.total}${v.huntLink ? ' — together' : ''}`, 3500);
    applyHunt(true);
    game?.emote();
  }

  // ── The 3D museum's callbacks ──
  function connectGame() {
    const galleryRooms = () => game.plan.rooms.filter((r) => !r.isFinale).length;
    game.onRoomChange = (room, index) => hud.setRoom(room, index, galleryRooms());
    game.onFocusChange = (item) => (item && !lightbox.isOpen ? placard.show(item) : placard.hide());
    game.onFinaleNear = (near) => letter.setNear(near);
    game.onOpenPhoto = (item) => (item.isVideo ? watchWallVideo(item) : openPhotos(game.photosInRoomOf(item), item));
    game.onOpenPlace = (photos) => {
      const items = photos.map((p) => game.itemOfPhoto(p));
      openPhotos(items, items[0]);
    };
    placard.onOpen = (item) => game.onOpenPhoto(item);
    lightbox.onClose = () => {
      document.body.classList.remove('viewing');
      if (gallery.isOpen) return;
      game.setPaused(false);
      if (game.focus) placard.show(game.focus);
    };
    game.onFindKey = (id) => findKey(id);
    game.onSeatChange = (seated) => hud.setSeated(seated);
    game.onFlash = () => selfie.flash();
    game.onSelfie = (blob) => selfie.show(blob);
    game.onQuiet = (quiet) => {
      document.body.classList.toggle('quiet', quiet);
      music.soften(quiet);
    };
    game.onTour = (state) => {
      hud.setTour(state);
      if (state === 'done') hud.showHint(game.finale?.locked ? 'That’s the tour — the last room opens once all the keys are found 🔑' : 'That’s the whole museum ♥', 6000);
      if (state === 'paused') hud.showHint('Tour paused — ▶ carries on from here', 3500);
    };
    hud.onTour = (cmd) => (cmd === 'toggle' ? game.toggleTour() : cmd === 'next' ? game.nextTourStop() : (game.stopTour(), hud.setTour('off')));

    // The proposal: on the screen of the one being asked…
    game.onProposal = (name) => {
      game.input.setEnabled(false);
      setTimeout(() => {
        if (!game.proposalFrom) return; // they got up already
        placard.hide();
        const p = visit.config.proposal;
        proposal.open({ question: p.question, from: name, yes: p.yes, no: p.no });
      }, 1400);
    };
    proposal.onYes = (dodges) => {
      game.answerYes();
      game.input.setEnabled(game.started && !game.paused);
      proposal.celebrate('YES! 💍', visit.config.proposal.after);
      if (visit.isGuest) import('./backend/visits.js').then((v) => v.saveYes(visit.museumId, visit.email, dodges)).catch(() => {});
    };
    game.onProposalEnd = () => {
      proposal.close();
      game.input.setEnabled(game.started && !game.paused);
    };
    // …and on the screen of the one who asked.
    game.onProposalAnswered = (name) => proposal.celebrate(`${name || 'They'} said YES! 💍`, visit.config.proposal.after);
    hud.onRing = () => game.propose();

    // Actions (A–Z keys, or the 😊 menu), short hints, and videos pausing the music.
    hud.onAction = (key) => game.performAction(key);
    game.onHint = (text) => hud.showHint(text, 3500);
    game.onVideoChange = (playing, { muted, loading } = {}) => {
      if (playing) music.pauseForVideo();
      else music.resumeAfterVideo();
      if (!playing) film.close();
      if (playing && muted) hud.showHint('Tap the screen for sound 🔊', 5000);
      else if (playing && loading) hud.showHint('The film is on its way… 🎬', 4000);
      else if (playing) hud.showHint(isTouch ? 'Tap the film for full screen 🎬' : 'Press Space for full screen 🎬', 4000);
    };

    // A film full screen (Space, or a tap on it, while sitting at it).
    game.onVideoFullscreen = () => {
      game.video.unmute(); // this tap / key counts as permission for sound
      if (!game.video.el?.src) return; // still on its way
      placard.hide();
      game.setPaused(true);
      film.open(game.video.el, game.video.item.video.title);
    };
    film.onClose = () => {
      game.setPaused(false);
      if (!game.wallVideos.loud) return;
      // A wall video: silent on the wall again, and the music comes back.
      game.wallVideos.quiet();
      music.resumeAfterVideo();
      if (game.focus) placard.show(game.focus);
    };

    // The wardrobe (👕): change your look in the middle of a visit.
    hud.onWardrobe = () => {
      placard.hide();
      game.setPaused(true);
      wardrobe.open(look);
    };
    wardrobe.onClose = (next) => {
      game.setPaused(false);
      if (encodeLook(next) === encodeLook(look)) return;
      look = next;
      saveLook(look);
      game.setLook(look);
      presence?.setLook(encodeLook(look));
    };

    // Struggling phone, mid-visit: offer the simple gallery.
    const simple = $('.hud-simple');
    simple.addEventListener('click', () => {
      simple.hidden = true;
      game.setPaused(true);
      $('#scene').hidden = true;
      hud.el.hidden = true;
      placard.hide();
      enterGallery('Switched to the simple gallery.', { music: false });
    });
    let slowFor = 0;
    setInterval(() => {
      if (!game.started || game.paused) return;
      const { fps, lowest } = game.performanceInfo;
      slowFor = lowest && fps < 12 ? slowFor + 1 : 0;
      if (slowFor >= 3) simple.hidden = false;
    }, 3000);
  }

  /** A video on a wall spot: full screen, with sound (inside the tap / key, for phones). */
  function watchWallVideo(item) {
    const el = game.wallVideos.forFullScreen(item);
    if (!el) return hud.showHint('The film is on its way… 🎬', 3500);
    placard.hide();
    music.pauseForVideo();
    game.setPaused(true);
    film.open(el, item.photo.title);
  }

  function openPhotos(list, item) {
    placard.hide();
    game.setPaused(true);
    document.body.classList.add('viewing');
    lightbox.open(list, Math.max(0, list.indexOf(item)));
  }

  // 4. "Enter": start the music (must happen inside the tap for iPhone), play, meet the others.
  function enter() {
    const { user, museumId, isGuest, config, settings } = visit;
    music.start();
    game.setSelfId(user.uid);
    game.start();
    hud.show();
    hud.showHint(isTouch
      ? 'Left thumb to walk · swipe to look around · 😊 for actions'
      : 'Arrow keys to walk · Space opens a photo · A–Z for actions (😊 lists them)');
    hud.showRing(config.proposal.enabled && config.proposal.proposer === visit.email);
    if (settings.tour) {
      setTimeout(() => {
        game.startTour();
        hud.showHint('A guided tour 🧭 — walk yourself any time to take over', 5000);
      }, game.reducedMotion ? 600 : 2200);
    }
    // The key hunt: a game for the two of you.
    setTimeout(() => {
      const h = visit?.hunt;
      if (!h?.total || !visit.isGuest || visit.found.size >= h.total) return; // (the curator walking through alone: no)
      const left = h.total - visit.found.size;
      hud.showHint(`${countLabel(config.hunt, left)} ${left === 1 ? 'is' : 'are'} hidden in the photos — find ${left === 1 ? 'it' : 'them'}${visit.huntLink ? ' together' : ''} ${h.emoji}`, 5500);
    }, settings.tour ? 9000 : 6000);

    hud.onEmote = () => {
      game.emote();
      presence?.emote();
    };
    import('./backend/presence.js')
      .then(({ joinPresence }) => joinPresence({
        museumId,
        user,
        name: settings.name || firstName(user),
        look: encodeLook(look),
        publish: isGuest,
        getState: () => game.localState(),
        onPeople: (people) => {
          const arrived = [...people.keys()].some((uid) => !hud.names.has(uid));
          game.setPeople(people);
          hud.setPeople(people);
          if (arrived) {
            clearTimeout(clockTimer);
            clockTimer = setTimeout(() => visit.refreshClocks?.(), 1500); // their time zone, for the clocks
          }
        },
      }))
      .then((p) => (presence = p))
      .catch((err) => console.warn('[presence] live avatars unavailable:', err.message));
  }

  /** The simple gallery instead of the 3D museum. */
  function enterGallery(reason, { music: startMusic = true } = {}) {
    if (startMusic) music.start();
    const { config, photos, videos, mirror } = visit;
    if (game) game.holdFrames = true; // no 3D drawing behind the gallery (the phone needs its power)
    gallery.onTry3D = () => {
      gallery.close();
      game.holdFrames = false;
      $('#scene').hidden = false;
      hud.el.hidden = false;
      if (!game.started) enter();
      else game.setPaused(false);
    };
    gallery.open({ config, photos, videos, mirror, reason, can3D: Boolean(game) });
    applyHunt();
  }
}

/** The first word of someone's Google name (or of their email). */
function firstName(user) {
  return (user.displayName || user.email).split(/[\s@]/)[0];
}

/** Blank frames for the sign-in page preview: a few per room, soft colours, no downloads. */
function previewPhotos(config) {
  const colors = ['#f3cfc8', '#cfe0d8', '#f6e1bd', '#dcd0ea', '#cadcee', '#f2d3de'];
  const shapes = [[4, 3], [3, 4], [1, 1], [4, 3]];
  const slots = [1, 4, 7, 10]; // spread around each room (layout.js numbers the spots clockwise)
  return config.rooms.flatMap((_, r) => shapes.map(([w, h], i) => ({
    room: r + 1, slot: slots[i], width: w * 100, height: h * 100, color: colors[(r * 4 + i) % colors.length], title: '', date: '', caption: '',
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
