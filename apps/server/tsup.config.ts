import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // El paquete compartido se publica como TypeScript: se incrusta en el bundle.
  noExternal: ['@adsb/shared'],
});
