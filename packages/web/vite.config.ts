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

/** Web app manifest, so Edge/Chrome offer "Install app" (SPEC §9). Built from APP_NAME, not hand-written. */
const manifest = JSON.stringify(
  {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'O sítio da equipa para falar de tudo menos trabalho.',
    lang: 'pt-PT',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#184BFF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  null,
  2,
);

function webManifest(): Plugin {
  return {
    name: 'pausa-manifest',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
    },
  };
}

const server = `http://127.0.0.1:${DEFAULT_PORT}`;

export default defineConfig({
  plugins: [react(), appName(), webManifest()],
  build: {
    // Never inline assets as data: URIs. The CSP's font-src is 'self' only, so an inlined font would be blocked.
    assetsInlineLimit: 0,
    // One small app: a single ~500 kB chunk (≈160 kB gzipped) is fine on a LAN or tunnel.
    chunkSizeWarningLimit: 700,
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
