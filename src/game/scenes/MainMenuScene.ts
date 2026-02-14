import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { MAX_HP_UPGRADE_CAP } from '../logic/metaProgression';
import { audioService } from '../services/AudioService';
import { yandexService } from '../services/YandexService';
import { progressStore } from '../state/ProgressStore';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';
import { ensureSceneRegistered } from './sceneLoader';

export class MainMenuScene extends Phaser.Scene {
  private statsText?: Phaser.GameObjects.Text;
  private menuStatusText?: Phaser.GameObjects.Text;
  private modalObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    const ui = getUiMetrics(this);
    this.drawBackground();
    audioService.startMusic();

    this.add
      .text(GAME_WIDTH / 2, 88, 'Triangle Arena', {
        fontFamily: 'Arial',
        fontSize: px(ui.heroTitleFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    this.statsText = this.add.text(ui.margin + 8, ui.margin + 4, this.buildStatsText(), {
      fontFamily: 'Arial',
      fontSize: px(ui.bodyFont),
      color: '#cbd5e1',
      lineSpacing: ui.lineSpacing
    });

    const buttonYStart = GAME_HEIGHT * 0.44;
    const step = ui.buttonHeight + ui.margin + 4;

    createTextButton(this, GAME_WIDTH / 2, buttonYStart, 'Start', () => {
      void this.startGame();
    }, { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont });

    createTextButton(this, GAME_WIDTH / 2, buttonYStart + step, 'Leaderboard', () => {
      void this.showLeaderboard();
    }, { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont });

    createTextButton(this, GAME_WIDTH / 2, buttonYStart + step * 2, 'Upgrade Hull', () => {
      this.tryPurchaseHullUpgrade();
    }, { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont });

    createTextButton(this, GAME_WIDTH / 2, buttonYStart + step * 3, 'Settings', () => {
      this.showSettings();
    }, { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont });

    this.menuStatusText = this.add
      .text(GAME_WIDTH / 2, buttonYStart + step * 3 + ui.buttonHeight * 0.9, this.hpUpgradeLabel(), {
        fontFamily: 'Arial',
        fontSize: px(ui.smallFont),
        color: '#bfdbfe',
        align: 'center',
        lineSpacing: ui.lineSpacing
      })
      .setOrigin(0.5, 0);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.clearModal();
    });
  }

  private handleResize(): void {
    if (!this.scene.isActive()) {
      return;
    }

    this.scene.restart();
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x15213b, 0x15213b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    g.fillStyle(0x1f2f52, 0.25);
    g.fillCircle(90, 80, 110);
    g.fillCircle(GAME_WIDTH - 70, GAME_HEIGHT - 80, 140);
  }

  private buildStatsText(): string {
    const p = progressStore.data;
    const sdkMode = yandexService.isMockMode() ? 'Mock SDK' : 'Yandex SDK';
    const hpUpgradeStatus =
      p.hpUpgradeLevel >= MAX_HP_UPGRADE_CAP
        ? `+${p.hpUpgradeLevel} HP (MAX)`
        : `+${p.hpUpgradeLevel} HP (next: ${progressStore.getNextHpUpgradeCost()} credits)`;

    return [
      `SDK: ${sdkMode}`,
      `Best Score: ${p.bestScore}`,
      `Wins: ${p.totalWins}`,
      `Losses: ${p.totalLosses}`,
      `Total Kills: ${p.totalKills}`,
      `Credits: ${p.credits}`,
      `Hull Upgrade: ${hpUpgradeStatus}`
    ].join('\n');
  }

  private refreshStats(): void {
    if (!this.statsText) {
      return;
    }

    this.statsText.setText(this.buildStatsText());
  }

  private async startGame(): Promise<void> {
    audioService.playUiClick();
    await audioService.unlock();
    await ensureSceneRegistered(this, 'GameScene', async () => (await import('./GameScene')).GameScene);
    await yandexService.showInterstitial();
    this.scene.start('GameScene');
  }

  private async showLeaderboard(): Promise<void> {
    audioService.playUiClick();
    this.clearModal();
    const ui = getUiMetrics(this);
    const panelWidth = ui.modalWidth;
    const panelHeight = Math.round(panelWidth * 0.58);

    const shadow = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
    shadow.setInteractive({ useHandCursor: true });

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.38, 'Leaderboard', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    const rowsText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.2, 'Loading leaderboard...', {
        fontFamily: 'Arial',
        fontSize: px(ui.bodyFont),
        color: '#e2e8f0',
        align: 'center',
        lineSpacing: ui.lineSpacing
      })
      .setOrigin(0.5, 0);

    const closeButton = createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + panelHeight * 0.36, 'Close', () => {
      audioService.playUiClick();
      this.clearModal();
    }, {
      width: Math.min(ui.buttonWidth, panelWidth - 120),
      height: ui.buttonHeight,
      fontSize: ui.buttonFont
    });

    this.modalObjects.push(shadow, panel, title, rowsText, closeButton);

    const rows = await yandexService.getLeaderboardTop(5, yandexService.getLeaderboardName());
    if (!this.scene.isActive() || !rowsText.active) {
      return;
    }

    if (!rows.length) {
      rowsText.setText('Leaderboard is empty yet.\nWin a run to submit your score.');
      return;
    }

    rowsText.setText(rows.map((row) => `${row.rank}. ${row.name} - ${row.score}`).join('\n'));
  }

  private showSettings(): void {
    audioService.playUiClick();
    this.clearModal();
    const ui = getUiMetrics(this);
    const panelWidth = ui.modalLargeWidth;
    const panelHeight = Math.min(GAME_HEIGHT - ui.margin * 2, Math.round(panelWidth * 0.52));

    const shadow = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
    shadow.setInteractive({ useHandCursor: true });

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.33, 'Settings', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5);

    const statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.1, this.soundLabel(), {
        fontFamily: 'Arial',
        fontSize: px(ui.bodyFont),
        color: '#e2e8f0'
      })
      .setOrigin(0.5);

    const compactButtonWidth = Math.min(panelWidth - 96, ui.buttonWidth - 18);
    const compactButtonHeight = Math.max(34, ui.buttonHeight - 10);
    const compactButtonFont = Math.max(14, ui.buttonFont - 2);

    const toggleSoundButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.12,
      'Toggle Sound',
      () => {
        const enabled = progressStore.toggleSound();
        audioService.setEnabled(enabled);
        audioService.playUiClick();
        void progressStore.save();
        statusText.setText(this.soundLabel());
        this.refreshStats();
      },
      { width: compactButtonWidth, height: compactButtonHeight, fontSize: compactButtonFont }
    );

    const closeButton = createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + panelHeight * 0.32, 'Close', () => {
      audioService.playUiClick();
      this.clearModal();
    }, {
      width: compactButtonWidth,
      height: compactButtonHeight,
      fontSize: compactButtonFont
    });

    this.modalObjects.push(shadow, panel, title, statusText, toggleSoundButton, closeButton);
  }

  private tryPurchaseHullUpgrade(): void {
    audioService.playUiClick();
    if (!progressStore.purchaseHpUpgrade()) {
      this.menuStatusText?.setColor('#fca5a5');
      this.menuStatusText?.setText(this.hpUpgradeLabel('Not enough credits or upgrade is already maxed.'));
      return;
    }

    void progressStore.save();
    this.refreshStats();
    this.menuStatusText?.setColor('#86efac');
    this.menuStatusText?.setText(this.hpUpgradeLabel('Upgrade purchased. +1 max HP will apply next run.'));
  }

  private soundLabel(): string {
    return `Sound: ${progressStore.data.soundEnabled ? 'ON' : 'OFF'}`;
  }

  private hpUpgradeLabel(message = ''): string {
    const { hpUpgradeLevel } = progressStore.data;
    const summary =
      hpUpgradeLevel >= MAX_HP_UPGRADE_CAP
        ? `Hull Upgrade: +${hpUpgradeLevel} HP (MAXED)`
        : `Hull Upgrade: +${hpUpgradeLevel} HP\nCost: ${progressStore.getNextHpUpgradeCost()} credits`;

    return message ? `${summary}\n${message}` : summary;
  }

  private clearModal(): void {
    this.modalObjects.forEach((item) => item.destroy());
    this.modalObjects = [];
  }
}
