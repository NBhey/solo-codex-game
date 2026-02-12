import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { yandexService } from '../services/YandexService';
import { createTextButton } from '../ui/createTextButton';

interface WinData {
  kills?: number;
  score?: number;
  elapsedMs?: number;
}

export class WinScene extends Phaser.Scene {
  private leaderboardText?: Phaser.GameObjects.Text;

  constructor() {
    super('WinScene');
  }

  create(data: WinData): void {
    const kills = data.kills ?? 0;
    const score = data.score ?? 0;
    const elapsedMs = data.elapsedMs ?? 0;

    this.cameras.main.setBackgroundColor(0x061a12);

    this.add
      .text(GAME_WIDTH / 2, 78, 'Victory!', {
        fontFamily: 'Arial',
        fontSize: '64px',
        color: '#86efac'
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        160,
        `Kills: ${kills} / 10\nScore: ${score}\nTime: ${(elapsedMs / 1000).toFixed(1)}s`,
        {
          fontFamily: 'Arial',
          fontSize: '28px',
          color: '#dcfce7',
          align: 'center',
          lineSpacing: 8
        }
      )
      .setOrigin(0.5);

    this.leaderboardText = this.add
      .text(GAME_WIDTH / 2, 272, 'Loading leaderboard preview...', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#bbf7d0',
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5, 0);

    createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 112, 'Play Again', () => {
      void this.restartRun();
    });

    createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 44, 'Main Menu', () => {
      this.scene.start('MainMenuScene');
    });

    void this.loadLeaderboardPreview();
  }

  private async restartRun(): Promise<void> {
    await yandexService.showInterstitial();
    this.scene.start('GameScene');
  }

  private async loadLeaderboardPreview(): Promise<void> {
    const rows = await yandexService.getLeaderboardTop(3, yandexService.getLeaderboardName());
    if (!this.leaderboardText || !this.leaderboardText.active) {
      return;
    }

    if (!rows.length) {
      this.leaderboardText.setText('Leaderboard is empty. Be the first winner!');
      return;
    }

    this.leaderboardText.setText(['Top 3:', ...rows.map((row) => `${row.rank}. ${row.name} - ${row.score}`)].join('\n'));
  }
}
