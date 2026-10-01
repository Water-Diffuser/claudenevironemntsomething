// Vite builds and serves the React frontend (web/). In dev it also forwards
// /api and /ws requests to the Node backend so the browser only talks to one origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { config } from './indulgent.config.ts';

const server = `127.0.0.1:${config.app.serverPort}`;

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@config': path.resolve(import.meta.dirname, 'indulgent.config.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: config.app.webPort,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': `http://${server}`,
      '/ws': { target: `ws://${server}`, ws: true },
    },
  },
  build: { outDir: '../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
