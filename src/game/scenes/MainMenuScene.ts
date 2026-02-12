import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { yandexService } from '../services/YandexService';
import { progressStore } from '../state/ProgressStore';
import { createTextButton } from '../ui/createTextButton';

export class MainMenuScene extends Phaser.Scene {
  private statsText?: Phaser.GameObjects.Text;
  private modalObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    this.drawBackground();

    this.add
      .text(GAME_WIDTH / 2, 88, 'Triangle Arena', {
        fontFamily: 'Arial',
        fontSize: '56px',
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    this.statsText = this.add.text(22, 18, this.buildStatsText(), {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#cbd5e1',
      lineSpacing: 6
    });

    createTextButton(this, GAME_WIDTH / 2, 250, 'Start', () => {
      void this.startGame();
    });

    createTextButton(this, GAME_WIDTH / 2, 325, 'Leaderboard', () => {
      void this.showLeaderboard();
    });

    createTextButton(this, GAME_WIDTH / 2, 400, 'Settings', () => {
      this.showSettings();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearModal());
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x15213b, 0x15213b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    g.fillStyle(0x1f2f52, 0.25);
    g.fillCircle(90, 80, 110);
    g.fillCircle(GAME_WIDTH - 70, GAME_HEIGHT - 80, 140);
  }

  private buildStatsText(): string {
    const p = progressStore.data;
    const sdkMode = yandexService.isMockMode() ? 'Mock SDK' : 'Yandex SDK';

    return [
      `SDK: ${sdkMode}`,
      `Best Score: ${p.bestScore}`,
      `Wins: ${p.totalWins}`,
      `Losses: ${p.totalLosses}`,
      `Total Kills: ${p.totalKills}`
    ].join('\n');
  }

  private refreshStats(): void {
    if (!this.statsText) {
      return;
    }
    this.statsText.setText(this.buildStatsText());
  }

  private async startGame(): Promise<void> {
    await yandexService.showInterstitial();
    this.scene.start('GameScene');
  }

  private async showLeaderboard(): Promise<void> {
    this.clearModal();

    const shadow = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
    shadow.setInteractive({ useHandCursor: true });

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 620, 360, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 135, 'Leaderboard', {
        fontFamily: 'Arial',
        fontSize: '34px',
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    const rowsText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'Loading leaderboard...', {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#e2e8f0',
        align: 'center',
        lineSpacing: 8
      })
      .setOrigin(0.5, 0);

    const closeButton = createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, 'Close', () => {
      this.clearModal();
    });

    this.modalObjects.push(shadow, panel, title, rowsText, closeButton);

    const rows = await yandexService.getLeaderboardTop(5, yandexService.getLeaderboardName());
    if (!this.scene.isActive() || !rowsText.active) {
      return;
    }

    if (!rows.length) {
      rowsText.setText('Leaderboard is empty yet.\nWin a run to submit your score.');
      return;
    }

    rowsText.setText(rows.map((row) => `${row.rank}. ${row.name} - ${row.score}`).join('\n'));
  }

  private showSettings(): void {
    this.clearModal();

    const shadow = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
    shadow.setInteractive({ useHandCursor: true });

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 620, 330, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 118, 'Settings', {
        fontFamily: 'Arial',
        fontSize: '34px',
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    const statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 46, this.soundLabel(), {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: '#e2e8f0'
      })
      .setOrigin(0.5);

    const toggleSoundButton = createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'Toggle Sound', () => {
      progressStore.toggleSound();
      void progressStore.save();
      statusText.setText(this.soundLabel());
      this.refreshStats();
    });

    const closeButton = createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 112, 'Close', () => {
      this.clearModal();
    });

    this.modalObjects.push(shadow, panel, title, statusText, toggleSoundButton, closeButton);
  }

  private soundLabel(): string {
    return `Sound: ${progressStore.data.soundEnabled ? 'ON' : 'OFF'}`;
  }

  private clearModal(): void {
    this.modalObjects.forEach((item) => item.destroy());
    this.modalObjects = [];
  }
}
