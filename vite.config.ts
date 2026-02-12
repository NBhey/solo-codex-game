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
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'vendor-phaser';
          }

          if (
            id.includes('/src/game/scenes/GameScene') ||
            id.includes('/src/game/scenes/WinScene') ||
            id.includes('/src/game/scenes/GameOverScene')
          ) {
            return 'gameplay-scenes';
          }

          if (
            id.includes('/src/game/services/YandexService') ||
            id.includes('/src/game/services/AudioService')
          ) {
            return 'platform-services';
          }

          return undefined;
        }
      }
    }
  }
});
