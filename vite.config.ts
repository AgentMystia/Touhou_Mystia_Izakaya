import { defineConfig } from 'vite';

// `base` is overridable so the same build works from a GitHub Pages subpath
// (/Touhou_Mystia_Izakaya/) and from the repo root during local preview.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 8192,
  },
  server: { port: 5173, host: '127.0.0.1' },
});
