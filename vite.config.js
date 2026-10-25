import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative paths so the site works at any URL, e.g. on GitHub Pages under
  // https://you.github.io/our-museum/ as well as on Netlify.
  base: './',
  server: { host: true }, // reachable from your phone on the same Wi-Fi
  preview: { host: true },
  build: {
    // Two pages: the museum, and the curator page at /admin/.
    rollupOptions: {
      input: {
        museum: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
    chunkSizeWarningLimit: 3300, // three.js and the HEIC decoder (only loaded for HEIC uploads in /admin) are big; expected
  },
});
