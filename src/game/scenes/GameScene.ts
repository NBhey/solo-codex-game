import Phaser from 'phaser';
import {
  BULLET_LIFETIME_MS,
  ENEMY_BULLET_SPEED,
  ENEMY_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  KILLS_TO_WIN,
  LEVEL_COUNT,
  PLAYER_BULLET_SPEED,
  PLAYER_MAX_HP,
  PLAYER_SHOT_COOLDOWN_MS,
  PLAYER_SPEED
} from '../config/gameConfig';
import { getRunCreditsReward } from '../logic/metaProgression';
import {
  getEnemyFireDelayRange,
  getWaveConfig,
  pickEnemyPattern,
  type EnemyPattern,
  type WaveConfig
} from '../logic/waveSystem';
import { audioService } from '../services/AudioService';
import { yandexService } from '../services/YandexService';
import { progressStore } from '../state/ProgressStore';
import { createTextButton } from '../ui/createTextButton';
import { getUiMetrics, px } from '../ui/uiMetrics';
import type { TextButton } from '../ui/createTextButton';
import {
  isSceneRegistered,
  safeStartScene,
  safeStartSceneWithWatchdog
} from './sceneLoader';
import { WinScene } from './WinScene';
import { GameOverScene } from './GameOverScene';

interface WinSceneData {
  kills: number;
  score: number;
  elapsedMs: number;
  creditsEarned: number;
  waveReached: number;
  reviveUsed: boolean;
}

interface GameOverSceneData {
  kills: number;
  creditsEarned: number;
  waveReached: number;
  reviveUsed: boolean;
}

interface GameSceneData {
  showInterstitialAfterRestart?: boolean;
}

type PauseState = 'none' | 'manual' | 'revive';
type EnemyKind = 'standard' | 'blue' | 'purple' | 'green';

export class GameScene extends Phaser.Scene {
  private static readonly PLAYER_TARGET_SIZE = 40;
  private static readonly BG_TILE_SIZE = 256;
  private static readonly ENEMY_PROJECTILE_RANGE_MULTIPLIER = 1.2;
  private static readonly BOOMERANG_RANGE_MULTIPLIER = 3.2;
  private static readonly ROCKET_PICKUP_SPAWN_MS = 16500;
  private static readonly ROCKET_PICKUP_LIFETIME_MS = 12000;
  private static readonly ROCKET_CHARGES_PER_PICKUP = 6;

  private player!: Phaser.Physics.Arcade.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private backgroundGradient?: Phaser.GameObjects.TileSprite;
  private backgroundGrid?: Phaser.GameObjects.TileSprite;
  private playerTextureKey = 'player-triangle';
  private enemyBaseTextureKey = 'enemy-triangle';

  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keyPause?: Phaser.Input.Keyboard.Key;
  private keyEscape?: Phaser.Input.Keyboard.Key;

  private kills = 0;
  private hp = PLAYER_MAX_HP;
  private playerMaxHp = PLAYER_MAX_HP;
  private wave = 1;
  private waveConfig: WaveConfig = getWaveConfig(0);

  private killsText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private rocketsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private lastShotAt = 0;
  private lastEnemyShotSfxAt = 0;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private pickupSpawnTimer?: Phaser.Time.TimerEvent;
  private startedAt = 0;
  private ending = false;
  private gameplayStarted = false;
  private showInterstitialAfterRestart = false;
  private isTouchControls = false;
  private touchMovePointerId: number | null = null;
  private touchMoveTarget: Phaser.Math.Vector2 | null = null;
  private touchAim = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  private touchAimActive = false;
  private pauseState: PauseState = 'none';
  private pauseOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private reviveOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private reviveStatusText?: Phaser.GameObjects.Text;
  private reviveUsed = false;
  private reviveOfferActive = false;
  private pauseButton?: TextButton;
  private touchMoveHintRect?: Phaser.GameObjects.Rectangle;
  private touchAimHintRect?: Phaser.GameObjects.Rectangle;
  private touchMoveHintText?: Phaser.GameObjects.Text;
  private touchAimHintText?: Phaser.GameObjects.Text;
  private rocketCharges = 0;
  private enemyKindCycle: EnemyKind[] = [];
  private enemyKindCycleIndex = 0;
  private enemyKindCycleKey = '';

  constructor() {
    super('GameScene');
  }

  init(data?: GameSceneData): void {
    this.showInterstitialAfterRestart = Boolean(data?.showInterstitialAfterRestart);
  }

  create(): void {
    this.resetRuntimeState();
    this.ensureEndScenesRegistered();
    this.playerMaxHp = progressStore.getPlayerMaxHp(PLAYER_MAX_HP);
    this.hp = this.playerMaxHp;
    this.input.setDefaultCursor('crosshair');
    this.removePointerListeners();
    this.resolveShipTextures();
    this.drawBackground();

    this.player = this.physics.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.playerTextureKey);
    this.normalizePlayerSize();
    this.player.setDrag(600, 600);
    this.player.setMaxVelocity(PLAYER_SPEED, PLAYER_SPEED);
    this.configureCamera();

    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.ensurePickupTextures();

    this.isTouchControls = this.sys.game.device.input.touch;
    this.setupCollisions();
    this.createHud();
    this.bindInput();
    this.createTouchHints();
    audioService.startMusic();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    if (this.showInterstitialAfterRestart) {
      void this.startGameplayAfterRestartAd();
    } else {
      this.startGameplayLoop();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      yandexService.markGameplayStop();
      this.input.setDefaultCursor('default');
      this.removePointerListeners();
      this.spawnTimer?.remove(false);
      this.pickupSpawnTimer?.remove(false);
      this.pickupSpawnTimer = undefined;
      this.destroyPauseOverlay();
      this.clearReviveOverlayObjects();
      this.pauseButton?.destroy();
      this.touchMoveHintRect?.destroy();
      this.touchAimHintRect?.destroy();
      this.touchMoveHintText?.destroy();
      this.touchAimHintText?.destroy();
      this.enemies?.children.each((child) => {
        this.destroyEnemyHpBar(child as Phaser.Physics.Arcade.Image);
        return true;
      });
      this.backgroundGradient?.destroy();
      this.backgroundGrid?.destroy();
      this.backgroundGradient = undefined;
      this.backgroundGrid = undefined;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
  }

  update(): void {
    this.handlePauseShortcuts();
    if (this.ending || !this.gameplayStarted || this.pauseState !== 'none') {
      return;
    }

    this.updatePlayerMovement();
    this.syncBackgroundToCamera();
    this.updateEnemyAI();
    this.updateBoomerangBullets();
    this.cleanupPickups();
    this.cleanupExpiredBullets();
  }

  private resetRuntimeState(): void {
    this.kills = 0;
    this.hp = PLAYER_MAX_HP;
    this.playerMaxHp = PLAYER_MAX_HP;
    this.wave = 1;
    this.waveConfig = getWaveConfig(0);
    this.lastShotAt = 0;
    this.lastEnemyShotSfxAt = 0;
    this.spawnTimer = undefined;
    this.startedAt = 0;
    this.ending = false;
    this.gameplayStarted = false;
    this.touchMovePointerId = null;
    this.touchMoveTarget = null;
    this.touchAim.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.touchAimActive = false;
    this.pauseState = 'none';
    this.reviveUsed = false;
    this.reviveOfferActive = false;
    this.rocketCharges = 0;
    this.enemyKindCycle = [];
    this.enemyKindCycleIndex = 0;
    this.enemyKindCycleKey = '';
  }

  private resolveShipTextures(): void {
    this.playerTextureKey = this.textures.exists('player-ship') ? 'player-ship' : 'player-triangle';
    const preferredEnemyTextures = [
      'enemy-red-ship',
      'enemy-yellow-ship',
      'enemy-triangle',
      'enemy-blue-ship',
      'enemy-purple-ship',
      'enemy-green-ship',
    ];
    this.enemyBaseTextureKey =
      preferredEnemyTextures.find((key) => this.textures.exists(key)) ?? 'enemy-triangle';
  }

  private normalizePlayerSize(): void {
    const width = this.player.displayWidth || this.player.width;
    const height = this.player.displayHeight || this.player.height;
    if (width <= 0 || height <= 0) {
      return;
    }

    const scale = Math.min(GameScene.PLAYER_TARGET_SIZE / width, GameScene.PLAYER_TARGET_SIZE / height);
    if (Number.isFinite(scale) && scale > 0) {
      this.player.setScale(scale);
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      return;
    }
    body.setSize(this.player.displayWidth * 0.72, this.player.displayHeight * 0.72, true);
  }

  private drawBackground(): void {
    this.ensureBackgroundTextures();
    this.backgroundGradient = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'space-bg-gradient')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-40);
    this.backgroundGrid = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'space-bg-grid')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-35)
      .setAlpha(0.78);
    this.syncBackgroundToCamera();
  }

  private ensureBackgroundTextures(): void {
    const tileSize = GameScene.BG_TILE_SIZE;

    if (!this.textures.exists('space-bg-gradient')) {
      const g = this.add.graphics();
      g.setVisible(false);
      g.fillGradientStyle(0x090f1f, 0x090f1f, 0x13203b, 0x13203b, 1);
      g.fillRect(0, 0, tileSize, tileSize);
      g.generateTexture('space-bg-gradient', tileSize, tileSize);
      g.destroy();
    }

    if (!this.textures.exists('space-bg-grid')) {
      const g = this.add.graphics();
      g.setVisible(false);
      g.clear();
      g.fillStyle(0x000000, 0);
      g.fillRect(0, 0, tileSize, tileSize);
      g.lineStyle(1, 0x1f3558, 0.72);
      for (let x = 0; x <= tileSize; x += 64) {
        g.lineBetween(x, 0, x, tileSize);
      }
      for (let y = 0; y <= tileSize; y += 64) {
        g.lineBetween(0, y, tileSize, y);
      }
      g.fillStyle(0xdbeafe, 0.34);
      for (let i = 0; i < 20; i += 1) {
        const starX = (i * 53) % tileSize;
        const starY = (i * 89) % tileSize;
        g.fillCircle(starX, starY, (i % 3) + 1);
      }
      g.generateTexture('space-bg-grid', tileSize, tileSize);
      g.destroy();
    }
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    camera.startFollow(this.player, true, 0.16, 0.16);
    camera.setDeadzone(Math.round(GAME_WIDTH * 0.42), Math.round(GAME_HEIGHT * 0.32));
    camera.setRoundPixels(false);
  }

  private syncBackgroundToCamera(): void {
    const camera = this.cameras.main;
    const viewWidth = Math.max(1, Math.round(camera.width / camera.zoom));
    const viewHeight = Math.max(1, Math.round(camera.height / camera.zoom));

    if (this.backgroundGradient) {
      this.backgroundGradient.setSize(viewWidth, viewHeight);
      this.backgroundGradient.tilePositionX = camera.scrollX * 0.15;
      this.backgroundGradient.tilePositionY = camera.scrollY * 0.15;
    }

    if (this.backgroundGrid) {
      this.backgroundGrid.setSize(viewWidth, viewHeight);
      this.backgroundGrid.tilePositionX = camera.scrollX;
      this.backgroundGrid.tilePositionY = camera.scrollY;
    }
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyPause = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.keyEscape = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    }

    if (this.isTouchControls) {
      this.input.addPointer(2);
    }

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
  }

  private setupCollisions(): void {
    this.physics.add.overlap(
      this.playerBullets,
      this.enemies,
      this.onPlayerBulletHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.enemyBullets,
      this.player,
      this.onEnemyBulletHitsPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.enemies,
      this.player,
      this.onEnemyTouchesPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.pickups,
      this.onPlayerCollectPickup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  private createHud(): void {
    this.killsText = this.add.text(0, 0, `Kills: ${this.kills}/${KILLS_TO_WIN}`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ecfeff'
    }).setScrollFactor(0).setDepth(20);
    this.hpText = this.add.text(0, 0, `HP: ${this.hp}/${this.playerMaxHp}`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#dcfce7'
    }).setScrollFactor(0).setDepth(20);
    this.waveText = this.add.text(0, 0, `Wave: ${this.wave}/${LEVEL_COUNT}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#bfdbfe'
    }).setScrollFactor(0).setDepth(20);
    this.creditsText = this.add.text(0, 0, 'Run Credits: 0', {
      fontFamily: 'Arial',
      fontSize: '17px',
      color: '#fef3c7'
    }).setScrollFactor(0).setDepth(20);
    this.rocketsText = this.add.text(0, 0, 'Rockets: 0', {
      fontFamily: 'Arial',
      fontSize: '17px',
      color: '#fecaca'
    }).setScrollFactor(0).setDepth(20);
    this.statusText = this.add
      .text(0, 0, this.getControlsHint(), {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#dbeafe'
      })
      .setScrollFactor(0)
      .setDepth(20)
      .setOrigin(0.5, 0);

    this.updateRocketHud();
    this.applyHudLayout();
  }

  private applyHudLayout(): void {
    const ui = getUiMetrics(this);
    const margin = ui.margin;

    this.killsText.setPosition(margin, margin * 0.7);
    this.killsText.setFontSize(px(ui.hudFont));

    this.hpText.setPosition(margin, margin * 0.7 + ui.hudFont + 4);
    this.hpText.setFontSize(px(ui.hudFont));

    this.waveText.setPosition(margin, margin * 0.7 + ui.hudFont * 2 + 8);
    this.waveText.setFontSize(px(ui.hudCompactFont));

    this.creditsText.setPosition(margin, margin * 0.7 + ui.hudFont * 2 + ui.hudCompactFont + 12);
    this.creditsText.setFontSize(px(ui.hudCompactFont));

    this.rocketsText.setPosition(
      margin,
      margin * 0.7 + ui.hudFont * 2 + ui.hudCompactFont * 2 + 16
    );
    this.rocketsText.setFontSize(px(ui.hudCompactFont));

    this.statusText.setPosition(GAME_WIDTH / 2, margin * 0.7);
    this.statusText.setFontSize(px(ui.hudCompactFont));

    this.pauseButton?.destroy();
    const pauseButtonWidth = ui.buttonCompactWidth;
    const pauseButtonHeight = Math.max(36, ui.buttonHeight - 8);
    this.pauseButton = createTextButton(
      this,
      GAME_WIDTH - pauseButtonWidth * 0.5 - ui.margin,
      margin + pauseButtonHeight * 0.5,
      'Pause',
      () => {
        audioService.playUiClick();
        this.togglePause();
      },
      {
        width: pauseButtonWidth,
        height: pauseButtonHeight,
        fontSize: Math.max(14, ui.buttonFont - 2)
      }
    );
    this.pauseButton.setDepth(22);
    this.pauseButton.setScrollFactor(0);
  }

  private createTouchHints(): void {
    if (!this.isTouchControls) {
      return;
    }

    this.touchMoveHintRect = this.add.rectangle(0, 0, 10, 10, 0x1e3a5f, 0.16).setOrigin(0, 1).setDepth(1);
    this.touchAimHintRect = this.add.rectangle(0, 0, 10, 10, 0x6b2d45, 0.16).setOrigin(0, 1).setDepth(1);
    this.touchMoveHintRect.setScrollFactor(0);
    this.touchAimHintRect.setScrollFactor(0);

    this.touchMoveHintText = this.add
      .text(0, 0, 'Move Zone', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#bfdbfe'
      })
      .setScrollFactor(0)
      .setOrigin(0.5, 0.5)
      .setDepth(2);

    this.touchAimHintText = this.add
      .text(0, 0, 'Aim + Shoot Zone', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#fecdd3'
      })
      .setScrollFactor(0)
      .setOrigin(0.5, 0.5)
      .setDepth(2);

    this.layoutTouchHints();
  }

  private layoutTouchHints(): void {
    if (!this.isTouchControls || !this.touchMoveHintRect || !this.touchAimHintRect) {
      return;
    }

    const ui = getUiMetrics(this);
    const zoneHeight = Math.round(Math.max(82, Math.min(122, 92 * ui.uiScale)));
    const leftWidth = GAME_WIDTH * 0.5;

    this.touchMoveHintRect.setPosition(0, GAME_HEIGHT).setSize(leftWidth, zoneHeight);
    this.touchAimHintRect.setPosition(leftWidth, GAME_HEIGHT).setSize(leftWidth, zoneHeight);
    this.touchMoveHintText?.setPosition(leftWidth * 0.5, GAME_HEIGHT - zoneHeight * 0.5);
    this.touchMoveHintText?.setFontSize(px(Math.max(13, ui.smallFont - 1)));
    this.touchAimHintText?.setPosition(leftWidth + leftWidth * 0.5, GAME_HEIGHT - zoneHeight * 0.5);
    this.touchAimHintText?.setFontSize(px(Math.max(13, ui.smallFont - 1)));
  }

  private handleResize(): void {
    this.syncBackgroundToCamera();
    this.applyHudLayout();
    this.layoutTouchHints();

    if (this.pauseState === 'manual' && this.pauseOverlayObjects.length > 0) {
      this.destroyPauseOverlay();
      this.showPauseOverlay();
    }

    if (this.reviveOfferActive && this.reviveOverlayObjects.length > 0) {
      const reviveMessage = this.reviveStatusText?.text ?? '';
      this.clearReviveOverlayObjects();
      this.showReviveOverlay();
      if (reviveMessage) {
        this.reviveStatusText?.setText(reviveMessage);
      }
    }
  }

  private updatePlayerMovement(): void {
    const move = new Phaser.Math.Vector2(0, 0);

    if (this.isTouchControls && this.touchMoveTarget) {
      move.set(this.touchMoveTarget.x - this.player.x, this.touchMoveTarget.y - this.player.y);
      if (move.lengthSq() < 64) {
        move.set(0, 0);
      }
    } else {
      if (this.keyW?.isDown) {
        move.y -= 1;
      }
      if (this.keyS?.isDown) {
        move.y += 1;
      }
      if (this.keyA?.isDown) {
        move.x -= 1;
      }
      if (this.keyD?.isDown) {
        move.x += 1;
      }
    }

    if (move.lengthSq() > 0) {
      move.normalize().scale(PLAYER_SPEED);
    }

    this.player.setVelocity(move.x, move.y);

    const aimX = this.touchAimActive ? this.touchAim.x : this.input.activePointer.worldX;
    const aimY = this.touchAimActive ? this.touchAim.y : this.input.activePointer.worldY;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, aimX, aimY);
    this.player.setRotation(angle + Math.PI / 2);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.pauseState !== 'none' || this.ending || !this.gameplayStarted) {
      return;
    }

    if (this.isPointerOverPauseButton(pointer)) {
      return;
    }

    if (!this.isTouchControls) {
      this.tryShoot(pointer.worldX, pointer.worldY);
      return;
    }

    if (pointer.x <= GAME_WIDTH * 0.5) {
      this.touchMovePointerId = pointer.id;
      if (this.touchMoveTarget) {
        this.touchMoveTarget.set(pointer.worldX, pointer.worldY);
      } else {
        this.touchMoveTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
      return;
    }

    this.touchAimActive = true;
    this.touchAim.set(pointer.worldX, pointer.worldY);
    this.tryShoot(pointer.worldX, pointer.worldY);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchControls || !pointer.isDown || this.pauseState !== 'none') {
      return;
    }

    if (pointer.id === this.touchMovePointerId) {
      if (this.touchMoveTarget) {
        this.touchMoveTarget.set(pointer.worldX, pointer.worldY);
      } else {
        this.touchMoveTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
      return;
    }

    this.touchAimActive = true;
    this.touchAim.set(pointer.worldX, pointer.worldY);
    this.tryShoot(pointer.worldX, pointer.worldY);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchControls) {
      return;
    }

    if (pointer.id === this.touchMovePointerId) {
      this.touchMovePointerId = null;
      this.touchMoveTarget = null;
      return;
    }

    this.touchAimActive = false;
  }

  private isPointerOverPauseButton(pointer: Phaser.Input.Pointer): boolean {
    if (!this.pauseButton || !this.pauseButton.visible) {
      return false;
    }

    const bounds = this.pauseButton.getBounds();
    return bounds.contains(pointer.x, pointer.y);
  }

  private removePointerListeners(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerUp, this);
  }

  private getControlsHint(): string {
    return this.isTouchControls
      ? 'Left zone: move. Right zone: aim/shoot. Use Pause anytime.'
      : 'WASD to move, LMB to shoot, P/Esc to pause.';
  }
  private tryShoot(targetX: number, targetY: number): void {
    if (!this.gameplayStarted || this.pauseState !== 'none') {
      return;
    }

    if (this.time.now - this.lastShotAt < PLAYER_SHOT_COOLDOWN_MS) {
      return;
    }

    this.lastShotAt = this.time.now;
    this.createBullet(
      this.playerBullets,
      this.player.x,
      this.player.y,
      targetX,
      targetY,
      PLAYER_BULLET_SPEED,
      0x9ef7a2
    );
    this.fireRocketAssist(targetX, targetY);
    audioService.playShoot();
  }
  private createBullet(
    group: Phaser.Physics.Arcade.Group,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    tint: number,
    options: {
      lifetimeMultiplier?: number;
      damage?: number;
    } = {}
  ): Phaser.Physics.Arcade.Image | null {
    const bullet = group.get(x, y, 'bullet') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) {
      return null;
    }

    bullet.enableBody(true, x, y, true, true);
    bullet.setScale(1);
    bullet.setTint(tint);
    bullet.setDepth(4);
    bullet.setData('isBoomerang', false);
    bullet.setData('boomerangReturning', false);
    bullet.setData('boomerangSpinDir', 1);
    bullet.setData('boomerangSpeed', speed);
    bullet.setData('boomerangReturnX', x);
    bullet.setData('boomerangReturnY', y);
    bullet.setData('boomerangTurnAt', 0);
    bullet.setData('boomerangCurveAt', 0);
    bullet.setData('isRocketAssist', false);
    bullet.setData('damage', options.damage ?? 1);

    const body = bullet.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      return null;
    }
    body.setAllowGravity(false);

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.physics.velocityFromRotation(angle, speed, body.velocity);
    bullet.setRotation(angle);
    const lifetimeMultiplier = options.lifetimeMultiplier ?? 1;
    bullet.setData('expiresAt', this.time.now + Math.round(BULLET_LIFETIME_MS * lifetimeMultiplier));
    return bullet;
  }

  private ensurePickupTextures(): void {
    if (!this.textures.exists('pickup-rocket-dot')) {
      const g = this.add.graphics();
      g.setVisible(false);
      g.fillStyle(0xef4444, 1);
      g.fillCircle(8, 8, 6);
      g.lineStyle(2, 0xfca5a5, 0.95);
      g.strokeCircle(8, 8, 6);
      g.generateTexture('pickup-rocket-dot', 16, 16);
      g.destroy();
    }
  }

  private spawnRocketPickup(): void {
    if (this.ending || this.pauseState !== 'none') {
      return;
    }

    if (this.pickups.countActive(true) > 0) {
      return;
    }

    const view = this.cameras.main.worldView;
    const margin = 80;
    const x = Phaser.Math.Between(Math.round(view.left + margin), Math.round(view.right - margin));
    const y = Phaser.Math.Between(Math.round(view.top + margin), Math.round(view.bottom - margin));
    const pickup = this.pickups.get(x, y, 'pickup-rocket-dot') as Phaser.Physics.Arcade.Image | null;
    if (!pickup) {
      return;
    }

    pickup.enableBody(true, x, y, true, true);
    pickup.setDepth(5);
    pickup.setScale(1);
    pickup.setTint(0xff4d4f);
    pickup.setData('pickupType', 'rocket-launcher');
    pickup.setData('expiresAt', this.time.now + GameScene.ROCKET_PICKUP_LIFETIME_MS);
  }

  private onPlayerCollectPickup(
    firstObject: Phaser.GameObjects.GameObject,
    secondObject: Phaser.GameObjects.GameObject
  ): void {
    const first = firstObject as Phaser.Physics.Arcade.Image;
    const second = secondObject as Phaser.Physics.Arcade.Image;

    const pickup = this.pickups.contains(first) ? first : this.pickups.contains(second) ? second : null;
    const player = first === this.player ? first : second === this.player ? second : null;
    if (!pickup || !player || !pickup.active || !player.active || this.ending) {
      return;
    }

    pickup.disableBody(true, true);
    if (pickup.getData('pickupType') === 'rocket-launcher') {
      this.rocketCharges += GameScene.ROCKET_CHARGES_PER_PICKUP;
      this.updateRocketHud();
      this.statusText.setText(`Rocket launcher acquired: ${this.rocketCharges} charges`);
      this.time.delayedCall(1200, () => {
        if (!this.ending && this.pauseState === 'none') {
          this.statusText.setText(this.getControlsHint());
        }
      });
    }
  }

  private fireRocketAssist(targetX: number, targetY: number): void {
    if (this.rocketCharges <= 0) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
    const perpendicular = new Phaser.Math.Vector2(-Math.sin(angle), Math.cos(angle)).scale(8);
    const speed = PLAYER_BULLET_SPEED * 1.42;

    [-1, 1].forEach((dir) => {
      const offsetX = perpendicular.x * dir;
      const offsetY = perpendicular.y * dir;
      const rocket = this.createBullet(
        this.playerBullets,
        this.player.x + offsetX,
        this.player.y + offsetY,
        targetX + offsetX * 2,
        targetY + offsetY * 2,
        speed,
        0xff4d4f,
        {
          damage: 2
        }
      );
      if (!rocket) {
        return;
      }

      rocket.setScale(0.3, 1.9);
      rocket.setDepth(5);
      rocket.setData('isRocketAssist', true);
      rocket.setData('expiresAt', this.time.now + Math.round(BULLET_LIFETIME_MS * 1.35));
    });

    this.rocketCharges = Math.max(0, this.rocketCharges - 1);
    this.updateRocketHud();
  }

  private updateRocketHud(): void {
    this.rocketsText.setText(`Rockets: ${this.rocketCharges}`);
  }

  private pickEnemyKind(): EnemyKind {
    const availableKinds = this.getAvailableEnemyKinds();
    const cycleKey = availableKinds.join('|');

    if (
      this.enemyKindCycle.length === 0 ||
      this.enemyKindCycleIndex >= this.enemyKindCycle.length ||
      this.enemyKindCycleKey !== cycleKey
    ) {
      this.enemyKindCycle = Phaser.Utils.Array.Shuffle([...availableKinds]);
      this.enemyKindCycleIndex = 0;
      this.enemyKindCycleKey = cycleKey;
    }

    const kind = this.enemyKindCycle[this.enemyKindCycleIndex] ?? 'standard';
    this.enemyKindCycleIndex += 1;
    return kind;
  }

  private getAvailableEnemyKinds(): EnemyKind[] {
    const kinds: EnemyKind[] = ['standard'];
    if (this.waveConfig.wave >= 2) {
      kinds.push('blue');
    }
    if (this.waveConfig.wave >= 3) {
      kinds.push('purple');
    }
    if (this.waveConfig.wave >= 4) {
      kinds.push('green');
    }
    return kinds;
  }

  private getEnemyTextureForKind(kind: EnemyKind): string {
    if (kind === 'blue') {
      if (this.textures.exists('enemy-blue-ship')) {
        return 'enemy-blue-ship';
      }
      if (this.textures.exists('enemy-yellow-ship')) {
        return 'enemy-yellow-ship';
      }
    }

    if (kind === 'purple') {
      if (this.textures.exists('enemy-purple-ship')) {
        return 'enemy-purple-ship';
      }
      if (this.textures.exists('enemy-red-ship')) {
        return 'enemy-red-ship';
      }
    }

    if (kind === 'green') {
      if (this.textures.exists('enemy-green-ship')) {
        return 'enemy-green-ship';
      }
      if (this.textures.exists('enemy-yellow-ship')) {
        return 'enemy-yellow-ship';
      }
    }

    if (this.textures.exists('enemy-red-ship')) {
      return 'enemy-red-ship';
    }
    if (this.textures.exists('enemy-yellow-ship')) {
      return 'enemy-yellow-ship';
    }

    return this.enemyBaseTextureKey;
  }

  private getEnemyMaxHp(kind: EnemyKind): number {
    if (kind === 'blue') {
      return 3;
    }
    return 1;
  }

  private normalizeEnemySize(enemy: Phaser.Physics.Arcade.Image, kind: EnemyKind): void {
    const baseWidth = enemy.width;
    const baseHeight = enemy.height;
    if (baseWidth <= 0 || baseHeight <= 0) {
      return;
    }

    // Enemies are reused from a physics pool, so reset scale before sizing.
    enemy.setScale(1);

    if (kind === 'blue') {
      const targetWidth = (this.player.displayWidth || GameScene.PLAYER_TARGET_SIZE) * 1.1;
      const targetHeight = (this.player.displayHeight || GameScene.PLAYER_TARGET_SIZE) * 1.1;
      const scale = Math.min(targetWidth / baseWidth, targetHeight / baseHeight);
      if (Number.isFinite(scale) && scale > 0) {
        enemy.setScale(scale);
      }
    }

    const body = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      return;
    }
    body.setAllowGravity(false);
    body.setSize(enemy.displayWidth * 0.72, enemy.displayHeight * 0.72, true);
  }

  private applyEnemyVisual(
    enemy: Phaser.Physics.Arcade.Image,
    kind: EnemyKind,
    pattern: EnemyPattern
  ): void {
    if (kind === 'blue') {
      enemy.setTint(0x60a5fa);
      return;
    }

    if (kind === 'purple') {
      enemy.setTint(0xc084fc);
      return;
    }

    if (kind === 'green') {
      enemy.setTint(0x4ade80);
      return;
    }

    if (pattern === 'strafer') {
      enemy.setTint(0x93c5fd);
    } else if (pattern === 'dasher') {
      enemy.setTint(0xfcd34d);
    } else {
      enemy.clearTint();
    }
  }

  private spawnEnemy(): void {
    if (this.ending || this.pauseState !== 'none') {
      return;
    }

    if (this.enemies.countActive(true) >= this.waveConfig.maxEnemiesOnField) {
      return;
    }

    const side = Phaser.Math.Between(0, 3);
    const view = this.cameras.main.worldView;
    const margin = 28;
    let x = 0;
    let y = 0;

    if (side === 0) {
      x = view.left - margin;
      y = Phaser.Math.Between(Math.round(view.top + margin), Math.round(view.bottom - margin));
    } else if (side === 1) {
      x = view.right + margin;
      y = Phaser.Math.Between(Math.round(view.top + margin), Math.round(view.bottom - margin));
    } else if (side === 2) {
      x = Phaser.Math.Between(Math.round(view.left + margin), Math.round(view.right - margin));
      y = view.top - margin;
    } else {
      x = Phaser.Math.Between(Math.round(view.left + margin), Math.round(view.right - margin));
      y = view.bottom + margin;
    }

    const kind = this.pickEnemyKind();
    const textureKey = this.getEnemyTextureForKind(kind);
    const enemy = this.enemies.get(x, y, textureKey) as Phaser.Physics.Arcade.Image | null;
    if (!enemy) {
      return;
    }

    const pattern = pickEnemyPattern(Math.random(), this.waveConfig);
    const maxHp = this.getEnemyMaxHp(kind);
    enemy.enableBody(true, x, y, true, true);
    enemy.setTexture(textureKey);
    this.normalizeEnemySize(enemy, kind);
    enemy.setDepth(3);
    enemy.setData('kind', kind);
    enemy.setData('hp', maxHp);
    enemy.setData('maxHp', maxHp);
    enemy.setData('pattern', pattern);
    enemy.setData('nextShotAt', this.time.now + this.getEnemyShotDelay(pattern, kind));
    enemy.setData('dashAt', this.time.now + Phaser.Math.Between(850, 1800));
    enemy.setData('dashUntil', 0);
    this.applyEnemyVisual(enemy, kind, pattern);
    this.attachEnemyHpBar(enemy);
  }

  private updateEnemyAI(): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) {
        this.destroyEnemyHpBar(enemy);
        return true;
      }

      const enemyBody = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!enemyBody) {
        return true;
      }

      const pattern = (enemy.getData('pattern') as EnemyPattern | undefined) ?? 'chaser';
      const kind = (enemy.getData('kind') as EnemyKind | undefined) ?? 'standard';
      const angleToPlayer = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const baseSpeed = ENEMY_SPEED * this.waveConfig.enemySpeedMultiplier;

      if (pattern === 'strafer') {
        const toPlayer = new Phaser.Math.Vector2(this.player.x - enemy.x, this.player.y - enemy.y);
        const distance = toPlayer.length();
        if (distance > 0.001) {
          toPlayer.normalize();
        }
        const sideways = new Phaser.Math.Vector2(-toPlayer.y, toPlayer.x);
        const radialFactor = distance > 220 ? 0.75 : distance < 140 ? -0.6 : 0.12;
        const vx = toPlayer.x * baseSpeed * radialFactor + sideways.x * baseSpeed * 0.95;
        const vy = toPlayer.y * baseSpeed * radialFactor + sideways.y * baseSpeed * 0.95;
        enemyBody.setVelocity(vx, vy);
      } else if (pattern === 'dasher') {
        const dashAt = Number(enemy.getData('dashAt') ?? 0);
        const dashUntil = Number(enemy.getData('dashUntil') ?? 0);

        if (this.time.now >= dashAt) {
          this.physics.velocityFromRotation(angleToPlayer, baseSpeed * 2.4, enemyBody.velocity);
          enemy.setData('dashUntil', this.time.now + 360);
          enemy.setData('dashAt', this.time.now + Phaser.Math.Between(1300, 2300));
        } else if (this.time.now >= dashUntil) {
          this.physics.velocityFromRotation(angleToPlayer, baseSpeed * 0.6, enemyBody.velocity);
        }
      } else {
        this.physics.velocityFromRotation(angleToPlayer, baseSpeed, enemyBody.velocity);
      }

      enemy.setRotation(angleToPlayer + Math.PI / 2);
      this.updateEnemyHpBar(enemy);

      const nextShotAt = Number(enemy.getData('nextShotAt') ?? 0);
      if (this.time.now >= nextShotAt) {
        this.shootEnemyProjectile(enemy, kind);

        if (this.time.now - this.lastEnemyShotSfxAt >= 110) {
          this.lastEnemyShotSfxAt = this.time.now;
          audioService.playEnemyShoot();
        }

        enemy.setData('nextShotAt', this.time.now + this.getEnemyShotDelay(pattern, kind));
      }

      return true;
    });
  }

  private shootEnemyProjectile(enemy: Phaser.Physics.Arcade.Image, kind: EnemyKind): void {
    if (kind === 'purple') {
      this.createBoomerangShot(enemy);
      return;
    }

    if (kind === 'green') {
      this.createGreenSpreadShot(enemy);
      return;
    }

    const speedMultiplier = kind === 'blue' ? 0.94 : 1;
    this.createBullet(
      this.enemyBullets,
      enemy.x,
      enemy.y,
      this.player.x,
      this.player.y,
      ENEMY_BULLET_SPEED * speedMultiplier,
      kind === 'blue' ? 0x93c5fd : 0xffb4b4,
      {
        lifetimeMultiplier: GameScene.ENEMY_PROJECTILE_RANGE_MULTIPLIER
      }
    );
  }

  private createBoomerangShot(enemy: Phaser.Physics.Arcade.Image): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | null;
    const leadX = this.player.x + (playerBody?.velocity.x ?? 0) * 0.16;
    const leadY = this.player.y + (playerBody?.velocity.y ?? 0) * 0.16;
    const speed = ENEMY_BULLET_SPEED * 1.05;
    const rangeMultiplier = GameScene.BOOMERANG_RANGE_MULTIPLIER;
    const spinDir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const launchAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, leadX, leadY);
    const lateralOffset = new Phaser.Math.Vector2(-Math.sin(launchAngle), Math.cos(launchAngle)).scale(
      72 * spinDir
    );
    const boomerang = this.createBullet(
      this.enemyBullets,
      enemy.x,
      enemy.y,
      leadX,
      leadY,
      speed,
      0xd8b4fe,
      {
        lifetimeMultiplier: GameScene.ENEMY_PROJECTILE_RANGE_MULTIPLIER
      }
    );
    if (!boomerang) {
      return;
    }

    boomerang.setScale(1.22);
    boomerang.setData('isBoomerang', true);
    boomerang.setData('boomerangReturning', false);
    boomerang.setData('boomerangSpinDir', spinDir);
    boomerang.setData('boomerangSpeed', speed);
    boomerang.setData('boomerangReturnX', enemy.x + lateralOffset.x);
    boomerang.setData('boomerangReturnY', enemy.y + lateralOffset.y);
    const straightDelay = Phaser.Math.Between(Math.round(260 * rangeMultiplier), Math.round(460 * rangeMultiplier));
    const curveDuration = Phaser.Math.Between(180, 260);
    boomerang.setData('boomerangCurveAt', this.time.now + straightDelay);
    boomerang.setData('boomerangTurnAt', this.time.now + straightDelay + curveDuration);
    boomerang.setData('expiresAt', this.time.now + Math.round(BULLET_LIFETIME_MS * (2.2 * rangeMultiplier)));
  }

  private createGreenSpreadShot(enemy: Phaser.Physics.Arcade.Image): void {
    const baseAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const spread = Phaser.Math.DegToRad(16);
    const angles = [baseAngle - spread, baseAngle, baseAngle + spread];
    const distance = 220;

    angles.forEach((angle) => {
      const targetX = enemy.x + Math.cos(angle) * distance;
      const targetY = enemy.y + Math.sin(angle) * distance;
      this.createBullet(
        this.enemyBullets,
        enemy.x,
        enemy.y,
        targetX,
        targetY,
        ENEMY_BULLET_SPEED * 0.96,
        0x86efac,
        {
          lifetimeMultiplier: GameScene.ENEMY_PROJECTILE_RANGE_MULTIPLIER
        }
      );
    });
  }

  private updateBoomerangBullets(): void {
    const now = this.time.now;
    const deltaMultiplier = Phaser.Math.Clamp(this.game.loop.delta / 16.6667, 0.6, 1.8);

    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active || !bullet.getData('isBoomerang')) {
        return true;
      }

      const body = bullet.body as Phaser.Physics.Arcade.Body | null;
      if (!body) {
        return true;
      }

      const speed = Number(bullet.getData('boomerangSpeed') ?? ENEMY_BULLET_SPEED);
      const spinDir = Number(bullet.getData('boomerangSpinDir') ?? 1) || 1;
      const curveAt = Number(bullet.getData('boomerangCurveAt') ?? 0);
      const turnAt = Number(bullet.getData('boomerangTurnAt') ?? 0);
      let returning = Boolean(bullet.getData('boomerangReturning'));

      if (!returning && now >= turnAt) {
        returning = true;
        bullet.setData('boomerangReturning', true);
      }

      if (returning) {
        const returnX = Number(bullet.getData('boomerangReturnX') ?? bullet.x);
        const returnY = Number(bullet.getData('boomerangReturnY') ?? bullet.y);
        const returnAngle = Phaser.Math.Angle.Between(bullet.x, bullet.y, returnX, returnY);
        const adjustedReturnAngle = returnAngle + spinDir * 0.014 * deltaMultiplier;
        this.physics.velocityFromRotation(adjustedReturnAngle, speed * 1.15, body.velocity);

        if (Phaser.Math.Distance.Between(bullet.x, bullet.y, returnX, returnY) <= 18) {
          bullet.disableBody(true, true);
          return true;
        }
      } else {
        if (now >= curveAt) {
          const currentAngle = Math.atan2(body.velocity.y, body.velocity.x);
          const curvedAngle = currentAngle + spinDir * 0.05 * deltaMultiplier;
          this.physics.velocityFromRotation(curvedAngle, speed, body.velocity);
        }
      }

      bullet.rotation += spinDir * 0.35 * deltaMultiplier;
      return true;
    });
  }

  private getEnemyShotDelay(pattern: EnemyPattern, kind: EnemyKind = 'standard'): number {
    const range = getEnemyFireDelayRange(this.waveConfig);
    let minMs = range.minMs;
    let maxMs = range.maxMs;

    if (pattern === 'strafer') {
      minMs *= 0.9;
      maxMs *= 0.9;
    }
    if (pattern === 'dasher') {
      minMs *= 1.1;
      maxMs *= 1.1;
    }

    if (kind === 'blue') {
      minMs *= 1.05;
      maxMs *= 1.1;
    } else if (kind === 'purple') {
      minMs *= 1.2;
      maxMs *= 1.35;
    }

    const min = Math.max(240, Math.round(minMs));
    const max = Math.max(min + 90, Math.round(maxMs));
    return Phaser.Math.Between(min, max);
  }

  private attachEnemyHpBar(enemy: Phaser.Physics.Arcade.Image): void {
    this.destroyEnemyHpBar(enemy);

    const kind = (enemy.getData('kind') as EnemyKind | undefined) ?? 'standard';
    if (kind !== 'blue') {
      return;
    }

    const hpBar = this.add.graphics();
    hpBar.setDepth(6);
    enemy.setData('hpBar', hpBar);
    this.updateEnemyHpBar(enemy);
  }

  private updateEnemyHpBar(enemy: Phaser.Physics.Arcade.Image): void {
    const hpBar = enemy.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    if (!hpBar) {
      return;
    }

    if (!enemy.active) {
      hpBar.clear();
      hpBar.setVisible(false);
      return;
    }

    const hp = Number(enemy.getData('hp') ?? 1);
    const maxHp = Number(enemy.getData('maxHp') ?? 1);
    if (maxHp <= 1) {
      hpBar.clear();
      hpBar.setVisible(false);
      return;
    }

    const width = 26;
    const height = 5;
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    const x = enemy.x - width / 2;
    const y = enemy.y - enemy.displayHeight * 0.58 - 10;

    hpBar.clear();
    hpBar.fillStyle(0x111827, 0.85);
    hpBar.fillRoundedRect(x, y, width, height, 1);
    hpBar.fillStyle(0x38bdf8, 1);
    hpBar.fillRoundedRect(x + 1, y + 1, Math.max(1, (width - 2) * ratio), height - 2, 1);
    hpBar.lineStyle(1, 0x93c5fd, 0.9);
    hpBar.strokeRoundedRect(x, y, width, height, 1);
    hpBar.setVisible(true);
  }

  private destroyEnemyHpBar(enemy: Phaser.Physics.Arcade.Image): void {
    const hpBar = enemy.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    if (hpBar) {
      hpBar.destroy();
    }
    enemy.setData('hpBar', undefined);
  }

  private cleanupExpiredBullets(): void {
    this.cleanupGroupBullets(this.playerBullets);
    this.cleanupGroupBullets(this.enemyBullets);
  }

  private cleanupPickups(): void {
    const now = this.time.now;
    this.pickups.children.each((child) => {
      const pickup = child as Phaser.Physics.Arcade.Image;
      if (!pickup.active) {
        return true;
      }

      const expiresAt = Number(pickup.getData('expiresAt') ?? 0);
      if (expiresAt > 0 && now >= expiresAt) {
        pickup.disableBody(true, true);
      }
      return true;
    });
  }

  private cleanupGroupBullets(group: Phaser.Physics.Arcade.Group): void {
    const now = this.time.now;
    group.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) {
        return true;
      }

      const expiresAt = Number(bullet.getData('expiresAt') ?? 0);
      if (expiresAt > 0 && now >= expiresAt) {
        bullet.disableBody(true, true);
      }

      return true;
    });
  }
  private onPlayerBulletHitsEnemy(
    firstObject: Phaser.GameObjects.GameObject,
    secondObject: Phaser.GameObjects.GameObject
  ): void {
    const first = firstObject as Phaser.Physics.Arcade.Image;
    const second = secondObject as Phaser.Physics.Arcade.Image;

    const bullet = this.playerBullets.contains(first)
      ? first
      : this.playerBullets.contains(second)
        ? second
        : null;
    const enemy = this.enemies.contains(first) ? first : this.enemies.contains(second) ? second : null;

    if (!bullet || !enemy || !bullet.active || !enemy.active || this.ending) {
      return;
    }

    bullet.disableBody(true, true);
    const bulletDamage = Math.max(1, Number(bullet.getData('damage') ?? 1));
    const nextHp = Number(enemy.getData('hp') ?? 1) - bulletDamage;
    if (nextHp > 0) {
      enemy.setData('hp', nextHp);
      this.updateEnemyHpBar(enemy);
      enemy.setAlpha(0.5);
      this.tweens.add({
        targets: enemy,
        alpha: 1,
        duration: 120,
        ease: 'Quad.Out'
      });
      return;
    }

    this.destroyEnemyHpBar(enemy);
    enemy.disableBody(true, true);
    this.kills += 1;
    this.killsText.setText(`Kills: ${this.kills}/${KILLS_TO_WIN}`);
    this.updateRunCreditsPreview();
    this.recalculateWave();

    if (this.kills >= KILLS_TO_WIN) {
      void this.finishWin();
    }
  }
  private onEnemyBulletHitsPlayer(
    firstObject: Phaser.GameObjects.GameObject,
    secondObject: Phaser.GameObjects.GameObject
  ): void {
    const first = firstObject as Phaser.Physics.Arcade.Image;
    const second = secondObject as Phaser.Physics.Arcade.Image;

    const bullet = this.enemyBullets.contains(first)
      ? first
      : this.enemyBullets.contains(second)
        ? second
        : null;
    const player = first === this.player ? first : second === this.player ? second : null;

    if (!bullet || !player || !bullet.active || !player.active || this.ending) {
      return;
    }

    bullet.disableBody(true, true);
    this.applyDamage(1);
  }
  private onEnemyTouchesPlayer(
    firstObject: Phaser.GameObjects.GameObject,
    secondObject: Phaser.GameObjects.GameObject
  ): void {
    const first = firstObject as Phaser.Physics.Arcade.Image;
    const second = secondObject as Phaser.Physics.Arcade.Image;

    const enemy = this.enemies.contains(first) ? first : this.enemies.contains(second) ? second : null;
    const player = first === this.player ? first : second === this.player ? second : null;

    if (!enemy || !player || !enemy.active || !player.active || this.ending) {
      return;
    }

    this.destroyEnemyHpBar(enemy);
    enemy.disableBody(true, true);
    this.applyDamage(1);
  }

  private applyDamage(value: number): void {
    this.hp -= value;
    this.hpText.setText(`HP: ${Math.max(0, this.hp)}/${this.playerMaxHp}`);
    this.cameras.main.shake(100, 0.004);
    audioService.playHit();

    if (this.hp <= 0) {
      if (!this.reviveUsed && !this.reviveOfferActive) {
        this.offerRevive();
      } else {
        void this.finishLoss();
      }
    }
  }
  private offerRevive(): void {
    this.reviveOfferActive = true;
    this.pauseGameplay('revive');
    this.statusText.setText('Critical damage! One revive is available.');
    this.showReviveOverlay();
  }

  private showReviveOverlay(): void {
    if (this.reviveOverlayObjects.length > 0) {
      this.setOverlayVisibility(this.reviveOverlayObjects, true);
      return;
    }

    const ui = getUiMetrics(this);
    const panelWidth = ui.modalLargeWidth;
    const panelHeight = Math.round(panelWidth * 0.5);
    const overlayDepth = 40;

    const shadow = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.72
    );
    shadow.setDepth(overlayDepth).setScrollFactor(0);

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.85);
    panel.setDepth(overlayDepth + 1).setScrollFactor(0);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.34, 'Revive Available', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5)
      .setDepth(overlayDepth + 2)
      .setScrollFactor(0);

    const note = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - panelHeight * 0.14,
        'Watch a rewarded ad to continue this run.\nOnly one revive can be used per run.',
        {
          fontFamily: 'Arial',
          fontSize: px(ui.bodyFont),
          color: '#e2e8f0',
          align: 'center',
          lineSpacing: ui.lineSpacing
        }
      )
      .setOrigin(0.5)
      .setDepth(overlayDepth + 2)
      .setScrollFactor(0);

    this.reviveStatusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + panelHeight * 0.08, '', {
        fontFamily: 'Arial',
        fontSize: px(ui.smallFont),
        color: '#fde68a'
      })
      .setOrigin(0.5)
      .setDepth(overlayDepth + 2)
      .setScrollFactor(0);

    const reviveButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.26,
      'Watch Ad and Revive',
      () => {
        void this.tryRevive(reviveButton);
      },
      { width: Math.min(panelWidth - 80, ui.modalWidth), height: ui.buttonHeight, fontSize: ui.buttonFont }
    );
    reviveButton.setDepth(overlayDepth + 2);
    reviveButton.setScrollFactor(0);

    const giveUpButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.42,
      'Give Up',
      () => {
        audioService.playUiClick();
        this.hideReviveOverlay();
        void this.finishLoss();
      },
      {
        width: Math.min(panelWidth - 160, ui.buttonWidth),
        height: ui.buttonHeight,
        fontSize: ui.buttonFont,
        normalColor: 0x5b1d2a,
        hoverColor: 0x7f1d1d
      }
    );
    giveUpButton.setDepth(overlayDepth + 2);
    giveUpButton.setScrollFactor(0);

    this.reviveOverlayObjects = [
      shadow,
      panel,
      title,
      note,
      this.reviveStatusText,
      reviveButton,
      giveUpButton
    ];
  }

  private async tryRevive(button: TextButton): Promise<void> {
    button.setEnabled(false);
    this.reviveStatusText?.setText('Loading rewarded ad...');
    await audioService.unlock();
    const rewarded = await yandexService.showRewarded();

    if (!this.scene.isActive() || this.ending) {
      return;
    }

    if (!rewarded) {
      this.reviveStatusText?.setText('Reward was not granted. Ending run...');
      await this.delay(400);
      this.hideReviveOverlay();
      void this.finishLoss();
      return;
    }

    this.reviveUsed = true;
    this.reviveOfferActive = false;
    this.hp = Math.max(2, Math.ceil(this.playerMaxHp * 0.5));
    this.hpText.setText(`HP: ${this.hp}/${this.playerMaxHp}`);
    this.clearGroup(this.enemyBullets);
    this.clearGroup(this.enemies);
    this.hideReviveOverlay();
    this.resumeGameplay();
    this.statusText.setText('Revive used. Back in action.');
    audioService.playRevive();
    yandexService.trackEvent('revive_used', {
      kills: this.kills,
      wave: this.wave
    });
  }

  private clearGroup(group: Phaser.Physics.Arcade.Group): void {
    group.children.each((child) => {
      const item = child as Phaser.Physics.Arcade.Image;
      if (item.active) {
        item.disableBody(true, true);
      }
      if (group === this.enemies) {
        this.destroyEnemyHpBar(item);
      }
      return true;
    });
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private async awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        window.setTimeout(() => resolve(undefined), timeoutMs);
      })
    ]);
  }

  private ensureEndScenesRegistered(): void {
    if (!isSceneRegistered(this, 'WinScene')) {
      this.scene.add('WinScene', WinScene, false);
    }
    if (!isSceneRegistered(this, 'GameOverScene')) {
      this.scene.add('GameOverScene', GameOverScene, false);
    }
  }

  private startSceneSafely(key: string, data?: object): void {
    safeStartScene(this, key, data);
  }

  private transitionWithWatchdog(
    key: string,
    data?: object,
    fallbackKey: string = 'MainMenuScene',
    timeoutMs: number = 1400
  ): void {
    safeStartSceneWithWatchdog(this, key, data, {
      fallbackKey,
      timeoutMs,
      shouldFallback: () => this.ending
    });
  }

  private handlePauseShortcuts(): void {
    const pressedPause =
      Boolean(this.keyPause && Phaser.Input.Keyboard.JustDown(this.keyPause)) ||
      Boolean(this.keyEscape && Phaser.Input.Keyboard.JustDown(this.keyEscape));

    if (!pressedPause) {
      return;
    }

    this.togglePause();
  }

  private togglePause(): void {
    if (this.ending || !this.gameplayStarted || this.reviveOfferActive) {
      return;
    }

    if (this.pauseState === 'manual') {
      this.resumeGameplay();
      return;
    }

    if (this.pauseState === 'none') {
      this.pauseGameplay('manual');
      this.statusText.setText('Paused');
    }
  }

  private pauseGameplay(nextState: Exclude<PauseState, 'none'>): void {
    if (this.pauseState === nextState) {
      return;
    }

    this.pauseState = nextState;
    this.physics.world.pause();
    if (this.spawnTimer) {
      this.spawnTimer.paused = true;
    }
    yandexService.markGameplayStop();

    if (nextState === 'manual') {
      this.showPauseOverlay();
    }
  }

  private resumeGameplay(): void {
    if (this.pauseState === 'none' || this.ending) {
      return;
    }

    const wasManual = this.pauseState === 'manual';
    this.pauseState = 'none';
    this.physics.world.resume();
    if (this.spawnTimer) {
      this.spawnTimer.paused = false;
    }
    yandexService.markGameplayStart();

    if (wasManual) {
      this.hidePauseOverlay();
      this.statusText.setText(this.getControlsHint());
    }
  }

  private showPauseOverlay(): void {
    if (this.pauseOverlayObjects.length > 0) {
      this.setOverlayVisibility(this.pauseOverlayObjects, true);
      return;
    }

    const ui = getUiMetrics(this);
    const panelWidth = ui.modalWidth;
    const panelHeight = Math.round(panelWidth * 0.52);
    const overlayDepth = 35;

    const shadow = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.62
    );
    shadow.setDepth(overlayDepth).setScrollFactor(0);

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.97);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);
    panel.setDepth(overlayDepth + 1).setScrollFactor(0);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.28, 'Paused', {
        fontFamily: 'Arial',
        fontSize: px(ui.sceneTitleFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5)
      .setDepth(overlayDepth + 2)
      .setScrollFactor(0);

    const resumeButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.02,
      'Resume',
      () => {
        audioService.playUiClick();
        this.resumeGameplay();
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );
    resumeButton.setDepth(overlayDepth + 2);
    resumeButton.setScrollFactor(0);

    const mainMenuButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.28,
      'Main Menu',
      () => {
        if (this.ending) {
          return;
        }
        audioService.playUiClick();
        this.ending = true;
        mainMenuButton.setEnabled(false);
        resumeButton.setEnabled(false);
        this.stopGameplayObjects();
        this.transitionWithWatchdog('MainMenuScene');
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );
    mainMenuButton.setDepth(overlayDepth + 2);
    mainMenuButton.setScrollFactor(0);

    this.pauseOverlayObjects = [shadow, panel, title, resumeButton, mainMenuButton];
  }

  private hidePauseOverlay(): void {
    this.setOverlayVisibility(this.pauseOverlayObjects, false);
  }

  private setOverlayVisibility(objects: Phaser.GameObjects.GameObject[], visible: boolean): void {
    objects.forEach((item) => {
      const candidate = item as Phaser.GameObjects.GameObject & {
        setVisible?: (value: boolean) => Phaser.GameObjects.GameObject;
      };
      candidate.setVisible?.(visible);
    });
  }

  private destroyPauseOverlay(): void {
    this.pauseOverlayObjects.forEach((item) => item.destroy());
    this.pauseOverlayObjects = [];
  }

  private clearReviveOverlayObjects(): void {
    this.reviveOverlayObjects.forEach((item) => item.destroy());
    this.reviveOverlayObjects = [];
    this.reviveStatusText = undefined;
  }

  private hideReviveOverlay(): void {
    this.clearReviveOverlayObjects();
    this.reviveOfferActive = false;
  }

  private stopGameplayObjects(): void {
    this.spawnTimer?.remove(false);
    this.spawnTimer = undefined;
    this.pickupSpawnTimer?.remove(false);
    this.pickupSpawnTimer = undefined;
    this.removePointerListeners();
    this.gameplayStarted = false;
    this.pauseState = 'none';
    this.physics.world.resume();
    this.hidePauseOverlay();
    this.hideReviveOverlay();

    this.player.setVelocity(0, 0);
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (enemy.active) {
        enemy.setVelocity(0, 0);
      }
      this.destroyEnemyHpBar(enemy);
      return true;
    });
    this.clearGroup(this.pickups);
  }

  private startGameplayLoop(): void {
    this.waveConfig = getWaveConfig(this.kills);
    this.wave = this.waveConfig.wave;
    this.waveText.setText(`Wave: ${this.wave}/${LEVEL_COUNT}`);
    this.recreateSpawnTimer();

    this.startedAt = this.time.now;
    this.gameplayStarted = true;
    this.statusText.setText(this.getControlsHint());
    this.updateRunCreditsPreview();
    this.updateRocketHud();

    this.pickupSpawnTimer?.remove(false);
    this.pickupSpawnTimer = this.time.addEvent({
      delay: GameScene.ROCKET_PICKUP_SPAWN_MS,
      loop: true,
      callback: () => this.spawnRocketPickup()
    });

    yandexService.markGameplayStart();
    yandexService.trackEvent('start_run', {
      hp_max: this.playerMaxHp,
      hp_upgrade_level: progressStore.data.hpUpgradeLevel,
      controls: this.isTouchControls ? 'touch' : 'keyboard'
    });
  }

  private recreateSpawnTimer(): void {
    const wasPaused = this.pauseState !== 'none';
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({
      delay: this.waveConfig.spawnDelayMs,
      loop: true,
      callback: () => this.spawnEnemy()
    });
    this.spawnTimer.paused = wasPaused;
  }

  private updateRunCreditsPreview(): void {
    this.creditsText.setText(`Run Credits: ${getRunCreditsReward(this.kills, false)}`);
  }

  private recalculateWave(): void {
    const previousWave = this.wave;
    const nextConfig = getWaveConfig(this.kills);
    const waveChanged = nextConfig.wave !== previousWave;
    const spawnDelayChanged = nextConfig.spawnDelayMs !== this.waveConfig.spawnDelayMs;

    this.waveConfig = nextConfig;
    this.wave = nextConfig.wave;
    this.waveText.setText(`Wave: ${this.wave}/${LEVEL_COUNT}`);

    if (spawnDelayChanged && this.gameplayStarted) {
      this.recreateSpawnTimer();
    }

    if (waveChanged) {
      this.statusText.setText(`Wave ${this.wave} engaged!`);
      this.time.delayedCall(900, () => {
        if (!this.ending && this.pauseState === 'none') {
          this.statusText.setText(this.getControlsHint());
        }
      });
    }
  }

  private async startGameplayAfterRestartAd(): Promise<void> {
    this.statusText.setText('Restarting. Showing ad...');
    await yandexService.showInterstitial();
    if (!this.scene.isActive() || this.ending) {
      return;
    }
    this.startGameplayLoop();
  }

  private async finishLoss(): Promise<void> {
    if (this.ending) {
      return;
    }

    this.ending = true;
    try {
      this.statusText.setText('Defeat...');
      this.stopGameplayObjects();
      yandexService.markGameplayStop();

      const creditsEarned = progressStore.recordLoss(this.kills);
      await this.awaitWithTimeout(progressStore.save(), 1400);

      yandexService.trackEvent('loss', {
        kills: this.kills,
        wave: this.wave,
        credits_earned: creditsEarned,
        revive_used: this.reviveUsed
      });

      await this.awaitWithTimeout(
        yandexService.showInterstitial().catch((error) => {
          console.error('[GameScene] Failed to show interstitial after loss', error);
          return false;
        }),
        4000
      );
      if (!this.scene.isActive()) {
        return;
      }

      const data: GameOverSceneData = {
        kills: this.kills,
        creditsEarned,
        waveReached: this.wave,
        reviveUsed: this.reviveUsed
      };
      this.transitionWithWatchdog('GameOverScene', data);
    } catch (error) {
      console.error('[GameScene] Failed to finish loss flow', error);
      this.startSceneSafely('MainMenuScene');
    }
  }

  private async finishWin(): Promise<void> {
    if (this.ending) {
      return;
    }

    this.ending = true;
    try {
      this.statusText.setText('Victory!');
      this.stopGameplayObjects();
      yandexService.markGameplayStop();

      const elapsedMs = Math.max(1, this.time.now - this.startedAt);
      const score = Math.max(1, Math.round(120000 - elapsedMs));
      const creditsEarned = progressStore.recordWin(score, this.kills);

      await this.awaitWithTimeout(progressStore.save(), 1400);
      await this.awaitWithTimeout(yandexService.submitScore(score), 1800);
      audioService.playWin();

      yandexService.trackEvent('win', {
        kills: this.kills,
        wave: this.wave,
        score,
        elapsed_ms: elapsedMs,
        credits_earned: creditsEarned,
        revive_used: this.reviveUsed
      });
      if (!this.scene.isActive()) {
        return;
      }

      const data: WinSceneData = {
        kills: this.kills,
        score,
        elapsedMs,
        creditsEarned,
        waveReached: this.wave,
        reviveUsed: this.reviveUsed
      };
      this.transitionWithWatchdog('WinScene', data);
    } catch (error) {
      console.error('[GameScene] Failed to finish win flow', error);
      this.startSceneSafely('MainMenuScene');
    }
  }
}
