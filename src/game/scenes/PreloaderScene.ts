import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { yandexService } from '../services/YandexService';
import { getUiMetrics, px } from '../ui/uiMetrics';

interface ShipCropDefinition {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ShipBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  centerY: number;
}

export class PreloaderScene extends Phaser.Scene {
  private shipsLoadFailed = false;

  constructor() {
    super('PreloaderScene');
  }

  preload(): void {
    this.load.image('ships-sheet', 'assets/ships.png');
    this.load.image('player-ship', 'assets/player-ship.png');
    this.load.image('enemy-red-ship', 'assets/enemy-red-ship.png');
    this.load.image('enemy-yellow-ship', 'assets/enemy-yellow-ship.png');

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (file.key === 'ships-sheet') {
        this.shipsLoadFailed = true;
      }
    });
  }

  create(): void {
    const ui = getUiMetrics(this);
    this.cameras.main.setBackgroundColor(0x0f172a);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Preloading assets...', {
        fontFamily: 'Arial',
        fontSize: px(ui.headingFont),
        color: '#cbd5e1'
      })
      .setOrigin(0.5);

    const hasDirectShips = this.hasAllShipTextures();
    const sheetShipsReady =
      !hasDirectShips &&
      !this.shipsLoadFailed &&
      this.textures.exists('ships-sheet') &&
      this.createShipTexturesFromSheet();

    if (!hasDirectShips && !sheetShipsReady) {
      this.createGeometryTextures();
    }

    this.ensureBulletTexture();
    yandexService.markLoadingReady();
    this.scene.start('MainMenuScene');
  }

  private hasAllShipTextures(): boolean {
    return (
      this.textures.exists('player-ship') &&
      this.textures.exists('enemy-red-ship') &&
      this.textures.exists('enemy-yellow-ship')
    );
  }

  private createShipTexturesFromSheet(): boolean {
    const source = this.textures.get('ships-sheet').getSourceImage() as CanvasImageSource | null;
    if (!source) {
      return false;
    }

    const dims = this.getSourceDimensions(source);
    const sheetData = this.getSourceImageData(source, dims.width, dims.height);
    if (!sheetData) {
      return false;
    }

    const bg = this.getBackgroundColor(sheetData.data, dims.width, dims.height);
    const detected = this.detectTargetShipBounds(sheetData.data, dims.width, dims.height, bg);
    if (detected) {
      return detected.every((entry) => this.createTextureFromBounds(source, entry.key, entry.bounds, bg));
    }

    // Conservative fallback: right-most large ship in each color block.
    const ships: ShipCropDefinition[] = [
      { key: 'player-ship', x: 348, y: 4, w: 84, h: 60 },
      { key: 'enemy-red-ship', x: 348, y: 150, w: 84, h: 60 },
      { key: 'enemy-yellow-ship', x: 348, y: 296, w: 84, h: 60 }
    ];

    return ships.every((ship) => this.createTextureFromCrop(source, ship, bg));
  }

  private createTextureFromCrop(
    source: CanvasImageSource,
    crop: ShipCropDefinition,
    bg: { r: number; g: number; b: number }
  ): boolean {
    if (this.textures.exists(crop.key)) {
      return true;
    }

    const canvasTexture = this.textures.createCanvas(crop.key, crop.w, crop.h);
    if (!canvasTexture) {
      return false;
    }

    const ctx = canvasTexture.getContext();
    ctx.clearRect(0, 0, crop.w, crop.h);
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const imageData = ctx.getImageData(0, 0, crop.w, crop.h);
    this.applyChromaKey(imageData.data, bg);
    ctx.putImageData(imageData, 0, 0);
    canvasTexture.refresh();
    return true;
  }

  private createTextureFromBounds(
    source: CanvasImageSource,
    key: string,
    bounds: ShipBounds,
    bg: { r: number; g: number; b: number }
  ): boolean {
    const pad = 2;
    const x = Math.max(0, bounds.minX - pad);
    const y = Math.max(0, bounds.minY - pad);
    const dims = this.getSourceDimensions(source);
    const w = Math.min(dims.width - x, bounds.maxX - bounds.minX + 1 + pad * 2);
    const h = Math.min(dims.height - y, bounds.maxY - bounds.minY + 1 + pad * 2);

    return this.createTextureFromCrop(source, { key, x, y, w, h }, bg);
  }

  private detectTargetShipBounds(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    bg: { r: number; g: number; b: number }
  ): Array<{ key: string; bounds: ShipBounds }> | null {
    const mask = this.createForegroundMask(data, width, height, bg);
    const components = this.findConnectedComponents(mask, width, height).filter(
      (item) => item.area >= 280 && item.maxX - item.minX + 1 >= 26 && item.maxY - item.minY + 1 >= 22
    );

    if (!components.length) {
      return null;
    }

    const bands = [
      { key: 'player-ship', minY: 0, maxY: height / 3 },
      { key: 'enemy-red-ship', minY: height / 3, maxY: (height * 2) / 3 },
      { key: 'enemy-yellow-ship', minY: (height * 2) / 3, maxY: height }
    ];

    const selected: Array<{ key: string; bounds: ShipBounds }> = [];

    for (const band of bands) {
      const candidates = components.filter(
        (item) =>
          item.centerY >= band.minY &&
          item.centerY < band.maxY &&
          item.maxX - item.minX + 1 >= 42 &&
          item.maxY - item.minY + 1 >= 30
      );

      if (!candidates.length) {
        return null;
      }

      const pick = candidates.sort((a, b) => b.maxX - a.maxX || b.area - a.area)[0];
      selected.push({ key: band.key, bounds: pick });
    }

    return selected;
  }

  private createForegroundMask(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    bg: { r: number; g: number; b: number }
  ): Uint8Array {
    const mask = new Uint8Array(width * height);

    for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
      if (data[i + 3] === 0) {
        continue;
      }

      const dr = Math.abs(data[i] - bg.r);
      const dg = Math.abs(data[i + 1] - bg.g);
      const db = Math.abs(data[i + 2] - bg.b);
      if (dr > 22 || dg > 22 || db > 22) {
        mask[pixel] = 1;
      }
    }

    return mask;
  }

  private findConnectedComponents(mask: Uint8Array, width: number, height: number): ShipBounds[] {
    const components: ShipBounds[] = [];

    for (let start = 0; start < mask.length; start += 1) {
      if (mask[start] === 0) {
        continue;
      }

      mask[start] = 0;
      const stack: number[] = [start];

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let area = 0;

      while (stack.length > 0) {
        const index = stack.pop() as number;
        const x = index % width;
        const y = Math.floor(index / width);

        area += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        const left = x > 0 ? index - 1 : -1;
        const right = x < width - 1 ? index + 1 : -1;
        const up = y > 0 ? index - width : -1;
        const down = y < height - 1 ? index + width : -1;

        if (left >= 0 && mask[left] === 1) {
          mask[left] = 0;
          stack.push(left);
        }
        if (right >= 0 && mask[right] === 1) {
          mask[right] = 0;
          stack.push(right);
        }
        if (up >= 0 && mask[up] === 1) {
          mask[up] = 0;
          stack.push(up);
        }
        if (down >= 0 && mask[down] === 1) {
          mask[down] = 0;
          stack.push(down);
        }
      }

      components.push({
        minX,
        minY,
        maxX,
        maxY,
        area,
        centerY: (minY + maxY) / 2
      });
    }

    return components;
  }

  private getSourceDimensions(source: CanvasImageSource): { width: number; height: number } {
    return {
      width: (source as { width: number }).width,
      height: (source as { height: number }).height
    };
  }

  private getSourceImageData(
    source: CanvasImageSource,
    width: number,
    height: number
  ): ImageData | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  private getBackgroundColor(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
    const corners = [
      this.readPixel(data, width, 0, 0),
      this.readPixel(data, width, width - 1, 0),
      this.readPixel(data, width, 0, height - 1),
      this.readPixel(data, width, width - 1, height - 1)
    ];

    return {
      r: Math.round((corners[0].r + corners[1].r + corners[2].r + corners[3].r) / 4),
      g: Math.round((corners[0].g + corners[1].g + corners[2].g + corners[3].g) / 4),
      b: Math.round((corners[0].b + corners[1].b + corners[2].b + corners[3].b) / 4)
    };
  }

  private readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): { r: number; g: number; b: number } {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2] };
  }

  private applyChromaKey(data: Uint8ClampedArray, bg: { r: number; g: number; b: number }): void {
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bg.r);
      const dg = Math.abs(data[i + 1] - bg.g);
      const db = Math.abs(data[i + 2] - bg.b);

      if (dr <= 22 && dg <= 22 && db <= 22) {
        data[i + 3] = 0;
      }
    }
  }

  private createGeometryTextures(): void {
    const g = this.add.graphics();
    g.setVisible(false);

    if (!this.textures.exists('player-triangle')) {
      g.clear();
      g.fillStyle(0x2ecc71, 1);
      g.fillTriangle(20, 2, 2, 38, 38, 38);
      g.generateTexture('player-triangle', 40, 40);
    }

    if (!this.textures.exists('enemy-triangle')) {
      g.clear();
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(20, 2, 2, 38, 38, 38);
      g.generateTexture('enemy-triangle', 40, 40);
    }

    g.destroy();
  }

  private ensureBulletTexture(): void {
    if (this.textures.exists('bullet')) {
      return;
    }

    const g = this.add.graphics();
    g.setVisible(false);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture('bullet', 12, 12);
    g.destroy();
  }
}
