import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, KILLS_TO_WIN } from '../config/gameConfig';
import { audioService } from '../services/AudioService';
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

    this.cameras.main.setBackgroundColor(0x04110d);

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020806, 0.72)
      .setDepth(1);

    const panelWidth = Math.min(GAME_WIDTH - 120, Math.round(ui.modalWidth * 0.88));
    const panelHeight = Math.min(GAME_HEIGHT - 80, Math.round(ui.modalLargeWidth * 0.6));

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x0e241c, 0.96)
      .setStrokeStyle(2, 0x5eead4, 0.85)
      .setDepth(2);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.33, 'Победа!', {
        fontFamily: 'Arial',
        fontSize: px(ui.sceneTitleFont),
        color: '#86efac'
      })
      .setOrigin(0.5)
      .setDepth(3);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - panelHeight * 0.04,
        `Убито: ${kills} / ${KILLS_TO_WIN}\nВолна: ${waveReached}\nСчет: ${score}\nКредитов: ${creditsEarned}\nВремя: ${(
          elapsedMs / 1000
        ).toFixed(1)}с${reviveUsed ? '\nРевайв использован: Да' : ''}`,
        {
          fontFamily: 'Arial',
          fontSize: px(ui.bodyFont),
          color: '#dcfce7',
          align: 'center',
          lineSpacing: ui.lineSpacing
        }
      )
      .setOrigin(0.5)
      .setDepth(3);

    const restartButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.22,
      'Начать сначала',
      () => {
        this.restartRun();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    const mainMenuButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.36,
      'Выйти в меню',
      () => {
        this.goToMainMenu();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );
    restartButton.setDepth(3);
    mainMenuButton.setDepth(3);
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
    const started = safeStartSceneWithWatchdog(this, 'GameScene', undefined, {
      fallbackKey: 'MainMenuScene',
      shouldFallback: () => this.transitionInProgress
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
      shouldFallback: () => this.transitionInProgress
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
