import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/sdk.js': {
        target: 'https://sdk.games.s3.yandex.net',
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    target: 'es2020'
  }
});
