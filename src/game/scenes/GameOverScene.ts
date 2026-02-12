import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { TextButton, createTextButton } from '../ui/createTextButton';

interface GameOverData {
  kills?: number;
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

    this.cameras.main.setBackgroundColor(0x190b12);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 130, 'Game Over', {
        fontFamily: 'Arial',
        fontSize: '62px',
        color: '#fca5a5'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 65, `Kills this run: ${kills}`, {
        fontFamily: 'Arial',
        fontSize: '28px',
        color: '#fee2e2'
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#fde68a'
      })
      .setOrigin(0.5);

    let restartButton: TextButton;
    restartButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 84,
      '\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u043d\u043e\u0432\u0430',
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
    button.setEnabled(false);
    this.statusText?.setText('\u0420\u0435\u0441\u0442\u0430\u0440\u0442...');

    const data: GameSceneStartData = {
      showInterstitialAfterRestart: true
    };
    this.scene.start('GameScene', data);
  }
}
