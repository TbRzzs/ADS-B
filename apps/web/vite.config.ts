import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.ADSB_API ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': API,
      '/map': API,
      '/ws': { target: API, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // MapLibre es grande y cambia poco: chunk propio, cacheable por separado.
        manualChunks: { maplibre: ['maplibre-gl'] },
      },
    },
  },
});
