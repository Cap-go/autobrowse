import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@capgo/oauth-loopback': path.resolve(__dirname, 'plugins/oauth-loopback/src/index.ts'),
    },
  },
});
