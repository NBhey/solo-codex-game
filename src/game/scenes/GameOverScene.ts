import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';
import type { TextButton } from '../ui/createTextButton';
import { safeStartSceneWithWatchdog } from './sceneLoader';

interface GameOverData {
  kills?: number;
  creditsEarned?: number;
  waveReached?: number;
  reviveUsed?: boolean;
}

interface GameSceneStartData {
  showInterstitialAfterRestart?: boolean;
}

export class GameOverScene extends Phaser.Scene {
  private statusText?: Phaser.GameObjects.Text;
  private snapshotData: GameOverData = {};
  private actionButtons: TextButton[] = [];
  private transitionInProgress = false;

  constructor() {
    super('GameOverScene');
  }

  create(data: GameOverData): void {
    this.actionButtons = [];
    this.transitionInProgress = false;
    this.snapshotData = { ...data };
    const kills = data.kills ?? 0;
    const creditsEarned = data.creditsEarned ?? 0;
    const waveReached = data.waveReached ?? 1;
    const reviveUsed = Boolean(data.reviveUsed);
    const ui = getUiMetrics(this);
    audioService.startMusic();

    this.cameras.main.setBackgroundColor(0x190b12);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28, 'Game Over', {
        fontFamily: 'Arial',
        fontSize: px(ui.sceneTitleFont),
        color: '#fca5a5'
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.41,
        `Kills this run: ${kills}\nWave reached: ${waveReached}\nCredits earned: ${creditsEarned}${
          reviveUsed ? '\nRevive used: Yes' : ''
        }`,
        {
          fontFamily: 'Arial',
          fontSize: px(ui.bodyFont),
          color: '#fee2e2',
          align: 'center',
          lineSpacing: ui.lineSpacing
        }
      )
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.56, '', {
        fontFamily: 'Arial',
        fontSize: px(ui.smallFont),
        color: '#fde68a'
      })
      .setOrigin(0.5);

    const restartButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.67,
      'Play Again',
      () => {
        this.restartRun();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    const mainMenuButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.81,
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
  }

  private handleResize(): void {
    if (!this.scene.isActive() || this.transitionInProgress) {
      return;
    }

    this.scene.restart(this.snapshotData);
  }

  private restartRun(): void {
    if (!this.beginTransition()) {
      return;
    }

    audioService.playUiClick();
    this.statusText?.setText('Restarting...');

    const data: GameSceneStartData = {
      showInterstitialAfterRestart: true
    };
    const started = safeStartSceneWithWatchdog(this, 'GameScene', data, {
      fallbackKey: 'MainMenuScene',
      shouldFallback: () => this.scene.isActive() && this.transitionInProgress
    });
    if (!started) {
      this.statusText?.setText('Restart failed. Try again.');
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
