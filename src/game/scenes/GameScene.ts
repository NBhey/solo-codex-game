import Phaser from 'phaser';
import {
  BULLET_LIFETIME_MS,
  ENEMY_BULLET_SPEED,
  ENEMY_FIRE_MAX_MS,
  ENEMY_FIRE_MIN_MS,
  ENEMY_SPAWN_DELAY_MS,
  ENEMY_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  KILLS_TO_WIN,
  MAX_ENEMIES_ON_FIELD,
  PLAYER_BULLET_SPEED,
  PLAYER_MAX_HP,
  PLAYER_SHOT_COOLDOWN_MS,
  PLAYER_SPEED
} from '../config/gameConfig';
import { yandexService } from '../services/YandexService';
import { progressStore } from '../state/ProgressStore';

interface WinSceneData {
  kills: number;
  score: number;
  elapsedMs: number;
}

interface GameOverSceneData {
  kills: number;
}

interface GameSceneData {
  showInterstitialAfterRestart?: boolean;
}

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

  private kills = 0;
  private hp = PLAYER_MAX_HP;

  private killsText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private lastShotAt = 0;
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

  constructor() {
    super('GameScene');
  }

  init(data?: GameSceneData): void {
    this.showInterstitialAfterRestart = Boolean(data?.showInterstitialAfterRestart);
  }

  create(): void {
    this.resetRuntimeState();
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
    });
  }

  update(): void {
    if (this.ending || !this.gameplayStarted) {
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
    this.lastShotAt = 0;
    this.spawnTimer = undefined;
    this.startedAt = 0;
    this.ending = false;
    this.gameplayStarted = false;
    this.touchMovePointerId = null;
    this.touchMoveTarget = null;
    this.touchAim.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.touchAimActive = false;
  }

  private resolveShipTextures(): void {
    this.playerTextureKey = this.textures.exists('player-ship') ? 'player-ship' : 'player-triangle';

    this.enemyTextureKeys = ['enemy-red-ship', 'enemy-yellow-ship'].filter((key) => this.textures.exists(key));
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
    this.killsText = this.add.text(14, 12, `Kills: ${this.kills}/${KILLS_TO_WIN}`, {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ecfeff'
    });

    this.hpText = this.add.text(14, 42, `HP: ${this.hp}`, {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#dcfce7'
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 14, this.getControlsHint(), {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#dbeafe'
      })
      .setOrigin(0.5, 0);
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
    if (!this.isTouchControls) {
      this.tryShoot(pointer.worldX, pointer.worldY);
      return;
    }

    const leftZone = pointer.x <= GAME_WIDTH * 0.5;
    if (leftZone) {
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
    if (!this.isTouchControls || !pointer.isDown) {
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
    return this.isTouchControls ? 'Touch left to move, right to aim/shoot' : 'WASD to move, LMB to shoot';
  }

  private tryShoot(targetX: number, targetY: number): void {
    if (!this.gameplayStarted) {
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
    if (this.ending || this.enemies.countActive(true) >= MAX_ENEMIES_ON_FIELD) {
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

    enemy.enableBody(true, x, y, true, true);
    enemy.setTexture(textureKey);
    enemy.setDepth(3);
    enemy.setData('nextShotAt', this.time.now + Phaser.Math.Between(ENEMY_FIRE_MIN_MS, ENEMY_FIRE_MAX_MS));
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

      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(angle, ENEMY_SPEED, enemyBody.velocity);
      enemy.setRotation(angle + Math.PI / 2);
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

        enemy.setData('nextShotAt', this.time.now + Phaser.Math.Between(ENEMY_FIRE_MIN_MS, ENEMY_FIRE_MAX_MS));
      }

      return true;
    });
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
    this.hpText.setText(`HP: ${this.hp}`);
    this.cameras.main.shake(100, 0.004);

    if (this.hp <= 0) {
      void this.finishLoss();
    }
  }

  private stopGameplayObjects(): void {
    this.spawnTimer?.remove(false);
    this.removePointerListeners();
    this.gameplayStarted = false;

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
    this.spawnTimer = this.time.addEvent({
      delay: ENEMY_SPAWN_DELAY_MS,
      loop: true,
      callback: () => this.spawnEnemy()
    });

    this.startedAt = this.time.now;
    this.gameplayStarted = true;
    this.statusText.setText(this.getControlsHint());
    yandexService.markGameplayStart();
  }

  private async startGameplayAfterRestartAd(): Promise<void> {
    this.statusText.setText('Restarted. Showing ad...');
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

    progressStore.recordLoss(this.kills);
    await progressStore.save();

    await yandexService.showInterstitial();

    const data: GameOverSceneData = {
      kills: this.kills
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

    progressStore.recordWin(score, this.kills);
    await progressStore.save();
    await yandexService.submitScore(score);

    const data: WinSceneData = {
      kills: this.kills,
      score,
      elapsedMs
    };

    this.scene.start('WinScene', data);
  }
}
