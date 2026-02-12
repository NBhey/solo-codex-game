import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { PreloaderScene } from './game/scenes/PreloaderScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { GameScene } from './game/scenes/GameScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { WinScene } from './game/scenes/WinScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b1020',
  scene: [BootScene, PreloaderScene, MainMenuScene, GameScene, GameOverScene, WinScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  }
};

new Phaser.Game(config);
