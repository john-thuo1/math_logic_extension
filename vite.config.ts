import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The demo site lives in site/. Its static files come from public/, and the
// build lands in dist/. No API keys are bundled: AI conversion lives in the
// extension, where the key stays on the user's machine.
export default defineConfig({
  root: path.resolve(__dirname, 'site'),
  publicDir: path.resolve(__dirname, 'public'),
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true },
  server: { port: 3000, host: '0.0.0.0' },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'site') } },
});
