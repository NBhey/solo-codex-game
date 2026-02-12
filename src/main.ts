import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { PreloaderScene } from './game/scenes/PreloaderScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { OrientationGuard } from './game/ui/OrientationGuard';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b1020',
  scene: [BootScene, PreloaderScene, MainMenuScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    expandParent: true,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  }
};

const game = new Phaser.Game(config);
const orientationGuard = new OrientationGuard(game);

window.addEventListener('beforeunload', () => {
  orientationGuard.destroy();
});
