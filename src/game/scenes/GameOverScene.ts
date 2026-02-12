import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
import { createTextButton } from '../ui/createTextButton';
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

  constructor() {
    super('GameOverScene');
  }

  create(data: GameOverData): void {
    const kills = data.kills ?? 0;
    const creditsEarned = data.creditsEarned ?? 0;
    const waveReached = data.waveReached ?? 1;
    const reviveUsed = Boolean(data.reviveUsed);
    audioService.startMusic();

    this.cameras.main.setBackgroundColor(0x190b12);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 130, 'Game Over', {
        fontFamily: 'Arial',
        fontSize: '62px',
        color: '#fca5a5'
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 65,
        `Kills this run: ${kills}\nWave reached: ${waveReached}\nCredits earned: ${creditsEarned}${
          reviveUsed ? '\nRevive used: Yes' : ''
        }`,
        {
          fontFamily: 'Arial',
          fontSize: '28px',
          color: '#fee2e2',
          align: 'center',
          lineSpacing: 6
        }
      )
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#fde68a'
      })
      .setOrigin(0.5);

    const restartButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 84,
      'Play Again',
      () => {
        this.restartRun(restartButton);
      },
      { width: 620, fontSize: 22 }
    );

    createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160, 'Main Menu', () => {
      this.scene.start('MainMenuScene');
    });
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
