import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the app works when served from an Object Storage
  // subpath (storage.yandexcloud.net/<bucket>/index.html).
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
