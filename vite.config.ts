import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vite builds the web client from `web/` into `dist/web`, which the Express server serves. */
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
