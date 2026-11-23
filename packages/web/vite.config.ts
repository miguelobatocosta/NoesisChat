import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// Relative import on purpose: Vite loads this config with plain Node, which can't import the
// TypeScript-source workspace package by name. The app code itself imports '@pausa/shared' normally.
import { APP_NAME, DEFAULT_PORT } from '../shared/src/constants.ts';

/** Puts APP_NAME (single source: packages/shared) into index.html's <title>. */
function appName(): Plugin {
  return {
    name: 'pausa-app-name',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
  };
}

const server = `http://127.0.0.1:${DEFAULT_PORT}`;

export default defineConfig({
  plugins: [react(), appName()],
  build: {
    // Never inline assets as data: URIs. The CSP's font-src is 'self' only, so an inlined font would be blocked.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': server,
      '/files': server,
      '/health': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
