import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// No API keys are bundled into the site. AI conversion lives in the
// browser extension, where the key stays on the user's machine.
export default defineConfig({
  server: { port: 3000, host: '0.0.0.0' },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
