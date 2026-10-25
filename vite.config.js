import { defineConfig } from 'vite';
import { buildGallery, PHOTOS_DIR } from './scripts/photos.mjs';

/**
 * Runs the photo pipeline (scripts/photos.mjs) before every dev start and
 * build, and — while `npm run dev` is running — again whenever something in
 * photos/ changes, then reloads the browser.
 */
function galleryPlugin() {
  let isBuild = false;
  let queue = Promise.resolve();
  const run = () => (queue = queue.then(() => buildGallery()));

  return {
    name: 'museum-gallery',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    async buildStart() {
      try {
        await run();
      } catch (err) {
        if (isBuild) throw err; // a broken photos.json must fail the build
        console.error(err.message); // …but shouldn't kill the dev server
        queue = Promise.resolve();
      }
    },
    configureServer(server) {
      server.watcher.add(PHOTOS_DIR);
      let timer;
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(PHOTOS_DIR)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            await run();
            server.ws.send({ type: 'full-reload' });
          } catch (err) {
            console.error(err.message);
            queue = Promise.resolve();
          }
        }, 400);
      });
    },
  };
}

export default defineConfig({
  // Relative paths so the site works at any URL, e.g. on GitHub Pages under
  // https://you.github.io/our-museum/ as well as on Netlify.
  base: './',
  plugins: [galleryPlugin()],
  server: { host: true }, // reachable from your phone on the same Wi-Fi
  preview: { host: true },
  build: {
    chunkSizeWarningLimit: 900, // three.js is big; that's expected
  },
});
