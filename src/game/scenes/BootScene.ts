import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { yandexService } from '../services/YandexService';
import { progressStore } from '../state/ProgressStore';
import { getUiMetrics, px } from '../ui/uiMetrics';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const ui = getUiMetrics(this);
    this.cameras.main.setBackgroundColor(0x0b1020);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16, 'Booting...', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#e2e8f0'
      })
      .setOrigin(0.5);

    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      await yandexService.init();
      await progressStore.load();
      audioService.setEnabled(progressStore.data.soundEnabled);
    } catch (error) {
      console.error('[BootScene] Startup failed:', error);
    } finally {
      this.scene.start('PreloaderScene');
    }
  }
}
