import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';
import type { TextButton } from '../ui/createTextButton';

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

  constructor() {
    super('GameOverScene');
  }

  create(data: GameOverData): void {
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
        this.restartRun(restartButton);
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.81,
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
  }

  private handleResize(): void {
    if (!this.scene.isActive()) {
      return;
    }

    this.scene.restart(this.snapshotData);
  }

  private restartRun(button: TextButton): void {
    audioService.playUiClick();
    button.setEnabled(false);
    this.statusText?.setText('Restarting...');

    const data: GameSceneStartData = {
      showInterstitialAfterRestart: true
    };
    this.scene.start('GameScene', data);
  }
}
