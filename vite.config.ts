import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  // Trailing slash matters: a bare '/api' prefix would also proxy the /api.ts module away from Vite.
  server: { port: 5173, proxy: { '/api/': 'http://127.0.0.1:4300' } },
});
