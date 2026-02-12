import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { yandexService } from '../services/YandexService';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';

interface WinData {
  kills?: number;
  score?: number;
  elapsedMs?: number;
  creditsEarned?: number;
  waveReached?: number;
  reviveUsed?: boolean;
}

export class WinScene extends Phaser.Scene {
  private leaderboardText?: Phaser.GameObjects.Text;
  private snapshotData: WinData = {};

  constructor() {
    super('WinScene');
  }

  create(data: WinData): void {
    this.snapshotData = { ...data };
    const kills = data.kills ?? 0;
    const score = data.score ?? 0;
    const elapsedMs = data.elapsedMs ?? 0;
    const creditsEarned = data.creditsEarned ?? 0;
    const waveReached = data.waveReached ?? 1;
    const reviveUsed = Boolean(data.reviveUsed);
    const ui = getUiMetrics(this);
    audioService.startMusic();

    this.cameras.main.setBackgroundColor(0x061a12);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.16, 'Victory!', {
        fontFamily: 'Arial',
        fontSize: px(ui.sceneTitleFont),
        color: '#86efac'
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.34,
        `Kills: ${kills} / 10\nWave reached: ${waveReached}\nScore: ${score}\nCredits earned: ${creditsEarned}\nTime: ${(
          elapsedMs / 1000
        ).toFixed(1)}s${reviveUsed ? '\nRevive used: Yes' : ''}`,
        {
          fontFamily: 'Arial',
          fontSize: px(ui.bodyFont),
          color: '#dcfce7',
          align: 'center',
          lineSpacing: ui.lineSpacing
        }
      )
      .setOrigin(0.5);

    this.leaderboardText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, 'Loading leaderboard preview...', {
        fontFamily: 'Arial',
        fontSize: px(ui.smallFont),
        color: '#bbf7d0',
        align: 'center',
        lineSpacing: ui.lineSpacing
      })
      .setOrigin(0.5, 0);

    createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.79,
      'Play Again',
      () => {
        void this.restartRun();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.9,
      'Main Menu',
      () => {
        audioService.playUiClick();
        this.scene.start('MainMenuScene');
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });

    void this.loadLeaderboardPreview();
  }

  private handleResize(): void {
    if (!this.scene.isActive()) {
      return;
    }

    this.scene.restart(this.snapshotData);
  }

  private async restartRun(): Promise<void> {
    audioService.playUiClick();
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
