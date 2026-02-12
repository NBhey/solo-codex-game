import Phaser from 'phaser';
import {
  BULLET_LIFETIME_MS,
  ENEMY_BULLET_SPEED,
  ENEMY_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  KILLS_TO_WIN,
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
import { ensureSceneRegistered } from './sceneLoader';

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

export class GameScene extends Phaser.Scene {
  private static readonly PLAYER_TARGET_SIZE = 40;
  private static readonly WRAP_MARGIN = 28;

  private player!: Phaser.Physics.Arcade.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private playerTextureKey = 'player-triangle';
  private enemyTextureKeys: string[] = ['enemy-triangle'];

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
  private statusText!: Phaser.GameObjects.Text;

  private lastShotAt = 0;
  private lastEnemyShotSfxAt = 0;
  private spawnTimer?: Phaser.Time.TimerEvent;
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
  private pauseOverlay?: Phaser.GameObjects.Container;
  private reviveOverlay?: Phaser.GameObjects.Container;
  private reviveStatusText?: Phaser.GameObjects.Text;
  private reviveUsed = false;
  private reviveOfferActive = false;
  private pauseButton?: TextButton;
  private touchMoveHintRect?: Phaser.GameObjects.Rectangle;
  private touchAimHintRect?: Phaser.GameObjects.Rectangle;
  private touchMoveHintText?: Phaser.GameObjects.Text;
  private touchAimHintText?: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  init(data?: GameSceneData): void {
    this.showInterstitialAfterRestart = Boolean(data?.showInterstitialAfterRestart);
  }

  create(): void {
    this.resetRuntimeState();
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

    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

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
      this.pauseOverlay?.destroy();
      this.reviveOverlay?.destroy();
      this.pauseButton?.destroy();
      this.touchMoveHintRect?.destroy();
      this.touchAimHintRect?.destroy();
      this.touchMoveHintText?.destroy();
      this.touchAimHintText?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
  }

  update(): void {
    this.handlePauseShortcuts();
    if (this.ending || !this.gameplayStarted || this.pauseState !== 'none') {
      return;
    }

    this.updatePlayerMovement();
    this.wrapAroundSprite(this.player);
    this.updateEnemyAI();
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
  }

  private resolveShipTextures(): void {
    this.playerTextureKey = this.textures.exists('player-ship') ? 'player-ship' : 'player-triangle';
    this.enemyTextureKeys = ['enemy-red-ship', 'enemy-yellow-ship'].filter((key) =>
      this.textures.exists(key)
    );
    if (!this.enemyTextureKeys.length) {
      this.enemyTextureKeys = ['enemy-triangle'];
    }
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
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x13203b, 0x13203b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(2, 0x1f3558, 0.7);
    for (let x = 0; x <= GAME_WIDTH; x += 80) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 80) {
      g.lineBetween(0, y, GAME_WIDTH, y);
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
  }

  private createHud(): void {
    this.killsText = this.add.text(0, 0, `Kills: ${this.kills}/${KILLS_TO_WIN}`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ecfeff'
    });
    this.hpText = this.add.text(0, 0, `HP: ${this.hp}/${this.playerMaxHp}`, {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#dcfce7'
    });
    this.waveText = this.add.text(0, 0, `Wave: ${this.wave}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#bfdbfe'
    });
    this.creditsText = this.add.text(0, 0, 'Run Credits: 0', {
      fontFamily: 'Arial',
      fontSize: '17px',
      color: '#fef3c7'
    });
    this.statusText = this.add
      .text(0, 0, this.getControlsHint(), {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#dbeafe'
      })
      .setOrigin(0.5, 0);

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
    this.pauseButton.setDepth(15);
  }

  private createTouchHints(): void {
    if (!this.isTouchControls) {
      return;
    }

    this.touchMoveHintRect = this.add.rectangle(0, 0, 10, 10, 0x1e3a5f, 0.16).setOrigin(0, 1).setDepth(1);
    this.touchAimHintRect = this.add.rectangle(0, 0, 10, 10, 0x6b2d45, 0.16).setOrigin(0, 1).setDepth(1);

    this.touchMoveHintText = this.add
      .text(0, 0, 'Move Zone', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#bfdbfe'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2);

    this.touchAimHintText = this.add
      .text(0, 0, 'Aim + Shoot Zone', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#fecdd3'
      })
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
    this.applyHudLayout();
    this.layoutTouchHints();

    if (this.pauseState === 'manual' && this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
      this.showPauseOverlay();
    }

    if (this.reviveOfferActive && this.reviveOverlay) {
      const reviveMessage = this.reviveStatusText?.text ?? '';
      this.reviveOverlay.destroy();
      this.reviveOverlay = undefined;
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

  private removePointerListeners(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerUp, this);
  }

  private wrapAroundSprite(sprite: Phaser.Physics.Arcade.Image): void {
    const m = GameScene.WRAP_MARGIN;
    if (sprite.x < -m) {
      sprite.x = GAME_WIDTH + m;
    } else if (sprite.x > GAME_WIDTH + m) {
      sprite.x = -m;
    }

    if (sprite.y < -m) {
      sprite.y = GAME_HEIGHT + m;
    } else if (sprite.y > GAME_HEIGHT + m) {
      sprite.y = -m;
    }
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
    audioService.playShoot();
  }
  private createBullet(
    group: Phaser.Physics.Arcade.Group,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    tint: number
  ): void {
    const bullet = group.get(x, y, 'bullet') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) {
      return;
    }

    bullet.enableBody(true, x, y, true, true);
    bullet.setTint(tint);
    bullet.setDepth(4);

    const body = bullet.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    this.physics.velocityFromRotation(angle, speed, body.velocity);
    bullet.setRotation(angle);
    bullet.setData('expiresAt', this.time.now + BULLET_LIFETIME_MS);
  }
  private spawnEnemy(): void {
    if (this.ending || this.pauseState !== 'none') {
      return;
    }

    if (this.enemies.countActive(true) >= this.waveConfig.maxEnemiesOnField) {
      return;
    }

    const side = Phaser.Math.Between(0, 3);
    const margin = 24;
    let x = 0;
    let y = 0;

    if (side === 0) {
      x = margin;
      y = Phaser.Math.Between(margin, GAME_HEIGHT - margin);
    } else if (side === 1) {
      x = GAME_WIDTH - margin;
      y = Phaser.Math.Between(margin, GAME_HEIGHT - margin);
    } else if (side === 2) {
      x = Phaser.Math.Between(margin, GAME_WIDTH - margin);
      y = margin;
    } else {
      x = Phaser.Math.Between(margin, GAME_WIDTH - margin);
      y = GAME_HEIGHT - margin;
    }

    const textureKey = Phaser.Utils.Array.GetRandom(this.enemyTextureKeys) ?? 'enemy-triangle';
    const enemy = this.enemies.get(x, y, textureKey) as Phaser.Physics.Arcade.Image | null;
    if (!enemy) {
      return;
    }

    const pattern = pickEnemyPattern(Math.random(), this.waveConfig);
    enemy.enableBody(true, x, y, true, true);
    enemy.setTexture(textureKey);
    enemy.setDepth(3);
    enemy.setData('pattern', pattern);
    enemy.setData('nextShotAt', this.time.now + this.getEnemyShotDelay(pattern));
    enemy.setData('dashAt', this.time.now + Phaser.Math.Between(850, 1800));
    enemy.setData('dashUntil', 0);

    if (pattern === 'strafer') {
      enemy.setTint(0x93c5fd);
    } else if (pattern === 'dasher') {
      enemy.setTint(0xfcd34d);
    } else {
      enemy.clearTint();
    }
  }

  private updateEnemyAI(): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) {
        return true;
      }

      const enemyBody = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!enemyBody) {
        return true;
      }

      const pattern = (enemy.getData('pattern') as EnemyPattern | undefined) ?? 'chaser';
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
      this.wrapAroundSprite(enemy);

      const nextShotAt = Number(enemy.getData('nextShotAt') ?? 0);
      if (this.time.now >= nextShotAt) {
        this.createBullet(
          this.enemyBullets,
          enemy.x,
          enemy.y,
          this.player.x,
          this.player.y,
          ENEMY_BULLET_SPEED,
          0xffb4b4
        );

        if (this.time.now - this.lastEnemyShotSfxAt >= 110) {
          this.lastEnemyShotSfxAt = this.time.now;
          audioService.playEnemyShoot();
        }

        enemy.setData('nextShotAt', this.time.now + this.getEnemyShotDelay(pattern));
      }

      return true;
    });
  }

  private getEnemyShotDelay(pattern: EnemyPattern): number {
    const range = getEnemyFireDelayRange(this.waveConfig);
    if (pattern === 'strafer') {
      return Phaser.Math.Between(Math.round(range.minMs * 0.9), Math.round(range.maxMs * 0.9));
    }
    if (pattern === 'dasher') {
      return Phaser.Math.Between(Math.round(range.minMs * 1.1), Math.round(range.maxMs * 1.1));
    }
    return Phaser.Math.Between(range.minMs, range.maxMs);
  }

  private cleanupExpiredBullets(): void {
    this.cleanupGroupBullets(this.playerBullets);
    this.cleanupGroupBullets(this.enemyBullets);
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
    const ui = getUiMetrics(this);
    const panelWidth = ui.modalLargeWidth;
    const panelHeight = Math.round(panelWidth * 0.5);

    const shadow = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.72
    );
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.98);
    panel.setStrokeStyle(2, 0x93c5fd, 0.85);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.34, 'Revive Available', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5);

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
      .setOrigin(0.5);

    this.reviveStatusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + panelHeight * 0.08, '', {
        fontFamily: 'Arial',
        fontSize: px(ui.smallFont),
        color: '#fde68a'
      })
      .setOrigin(0.5);

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

    this.reviveOverlay = this.add.container(0, 0, [
      shadow,
      panel,
      title,
      note,
      this.reviveStatusText,
      reviveButton,
      giveUpButton
    ]);
    this.reviveOverlay.setDepth(40);
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
      return true;
    });
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    if (this.pauseOverlay) {
      this.pauseOverlay.setVisible(true);
      return;
    }

    const ui = getUiMetrics(this);
    const panelWidth = ui.modalWidth;
    const panelHeight = Math.round(panelWidth * 0.52);

    const shadow = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.62
    );
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelWidth, panelHeight, 0x111827, 0.97);
    panel.setStrokeStyle(2, 0x93c5fd, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelHeight * 0.28, 'Paused', {
        fontFamily: 'Arial',
        fontSize: px(ui.sceneTitleFont),
        color: '#f8fafc'
      })
      .setOrigin(0.5);

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

    const mainMenuButton = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + panelHeight * 0.28,
      'Main Menu',
      () => {
        audioService.playUiClick();
        this.ending = true;
        this.stopGameplayObjects();
        this.scene.start('MainMenuScene');
      },
      { width: ui.buttonWidth, height: ui.buttonHeight, fontSize: ui.buttonFont }
    );

    this.pauseOverlay = this.add.container(0, 0, [shadow, panel, title, resumeButton, mainMenuButton]);
    this.pauseOverlay.setDepth(35);
  }

  private hidePauseOverlay(): void {
    this.pauseOverlay?.setVisible(false);
  }

  private hideReviveOverlay(): void {
    this.reviveOverlay?.destroy();
    this.reviveOverlay = undefined;
    this.reviveStatusText = undefined;
    this.reviveOfferActive = false;
  }

  private stopGameplayObjects(): void {
    this.spawnTimer?.remove(false);
    this.spawnTimer = undefined;
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
      return true;
    });
  }

  private startGameplayLoop(): void {
    this.waveConfig = getWaveConfig(this.kills);
    this.wave = this.waveConfig.wave;
    this.waveText.setText(`Wave: ${this.wave}`);
    this.recreateSpawnTimer();

    this.startedAt = this.time.now;
    this.gameplayStarted = true;
    this.statusText.setText(this.getControlsHint());
    this.updateRunCreditsPreview();

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
    this.waveText.setText(`Wave: ${this.wave}`);

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
    this.statusText.setText('Defeat...');
    this.stopGameplayObjects();
    yandexService.markGameplayStop();

    const creditsEarned = progressStore.recordLoss(this.kills);
    await progressStore.save();

    yandexService.trackEvent('loss', {
      kills: this.kills,
      wave: this.wave,
      credits_earned: creditsEarned,
      revive_used: this.reviveUsed
    });

    await ensureSceneRegistered(this, 'GameOverScene', async () => (await import('./GameOverScene')).GameOverScene);
    await yandexService.showInterstitial();

    const data: GameOverSceneData = {
      kills: this.kills,
      creditsEarned,
      waveReached: this.wave,
      reviveUsed: this.reviveUsed
    };
    this.scene.start('GameOverScene', data);
  }

  private async finishWin(): Promise<void> {
    if (this.ending) {
      return;
    }

    this.ending = true;
    this.statusText.setText('Victory!');
    this.stopGameplayObjects();
    yandexService.markGameplayStop();

    const elapsedMs = Math.max(1, this.time.now - this.startedAt);
    const score = Math.max(1, 120000 - elapsedMs);
    const creditsEarned = progressStore.recordWin(score, this.kills);
    await progressStore.save();
    await yandexService.submitScore(score);
    audioService.playWin();

    yandexService.trackEvent('win', {
      kills: this.kills,
      wave: this.wave,
      score,
      elapsed_ms: elapsedMs,
      credits_earned: creditsEarned,
      revive_used: this.reviveUsed
    });

    await ensureSceneRegistered(this, 'WinScene', async () => (await import('./WinScene')).WinScene);

    const data: WinSceneData = {
      kills: this.kills,
      score,
      elapsedMs,
      creditsEarned,
      waveReached: this.wave,
      reviveUsed: this.reviveUsed
    };
    this.scene.start('WinScene', data);
  }
}
