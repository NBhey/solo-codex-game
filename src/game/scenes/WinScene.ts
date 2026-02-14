import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, KILLS_TO_WIN } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { yandexService } from '../services/YandexService';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';
import type { TextButton } from '../ui/createTextButton';
import { safeStartSceneWithWatchdog } from './sceneLoader';

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
  private actionButtons: TextButton[] = [];
  private transitionInProgress = false;

  constructor() {
    super('WinScene');
  }

  create(data: WinData): void {
    this.actionButtons = [];
    this.transitionInProgress = false;
    this.snapshotData = { ...data };
    const kills = data.kills ?? 0;
    const score = Math.max(0, Math.round(data.score ?? 0));
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
        `Kills: ${kills} / ${KILLS_TO_WIN}\nWave reached: ${waveReached}\nScore: ${score}\nCredits earned: ${creditsEarned}\nTime: ${(
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

    const restartButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.79,
      'Play Again',
      () => {
        void this.restartRun();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    const mainMenuButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.9,
      'Main Menu',
      () => {
        this.goToMainMenu();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );
    this.actionButtons = [restartButton, mainMenuButton];

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.actionButtons = [];
      this.transitionInProgress = false;
    });

    void this.loadLeaderboardPreview();
  }

  private handleResize(): void {
    if (!this.scene.isActive() || this.transitionInProgress) {
      return;
    }

    this.scene.restart(this.snapshotData);
  }

  private async restartRun(): Promise<void> {
    if (!this.beginTransition()) {
      return;
    }

    audioService.playUiClick();
    await yandexService.showInterstitial();

    if (!this.scene.isActive()) {
      return;
    }

    const started = safeStartSceneWithWatchdog(this, 'GameScene', undefined, {
      fallbackKey: 'MainMenuScene',
      shouldFallback: () => this.scene.isActive() && this.transitionInProgress
    });
    if (!started) {
      this.resetTransition();
    }
  }

  private goToMainMenu(): void {
    if (!this.beginTransition()) {
      return;
    }

    audioService.playUiClick();
    const started = safeStartSceneWithWatchdog(this, 'MainMenuScene', undefined, {
      shouldFallback: () => this.scene.isActive() && this.transitionInProgress
    });
    if (!started) {
      this.resetTransition();
    }
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

  private beginTransition(): boolean {
    if (this.transitionInProgress || !this.scene.isActive()) {
      return false;
    }

    this.transitionInProgress = true;
    this.actionButtons.forEach((button) => button.setEnabled(false));
    return true;
  }

  private resetTransition(): void {
    if (!this.scene.isActive()) {
      return;
    }

    this.transitionInProgress = false;
    this.actionButtons.forEach((button) => button.setEnabled(true));
  }
}
