import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toInt(value: number): number {
  return Math.round(value);
}

export interface UiMetrics {
  isMobile: boolean;
  fitScale: number;
  uiScale: number;
  margin: number;
  heroTitleFont: number;
  sceneTitleFont: number;
  headingFont: number;
  bodyFont: number;
  smallFont: number;
  hudFont: number;
  hudCompactFont: number;
  lineSpacing: number;
  buttonWidth: number;
  buttonCompactWidth: number;
  buttonHeight: number;
  buttonFont: number;
  modalWidth: number;
  modalLargeWidth: number;
}

export function px(value: number): string {
  return `${Math.max(1, Math.round(value))}px`;
}

export function getUiMetrics(scene: Phaser.Scene): UiMetrics {
  const displayWidth = Math.max(1, scene.scale.displaySize.width);
  const displayHeight = Math.max(1, scene.scale.displaySize.height);
  const fitScale = Math.min(displayWidth / GAME_WIDTH, displayHeight / GAME_HEIGHT);
  const normalizedFitScale = clamp(fitScale, 0.5, 2.1);
  const sizeCompensation = clamp(1 / Math.sqrt(normalizedFitScale), 0.82, 1.16);
  const isMobile = scene.sys.game.device.input.touch || displayWidth <= 860;
  const uiScale = clamp(sizeCompensation * (isMobile ? 1.04 : 1), 0.82, 1.18);

  return {
    isMobile,
    fitScale,
    uiScale,
    margin: toInt(14 * uiScale),
    heroTitleFont: toInt(48 * uiScale),
    sceneTitleFont: toInt(42 * uiScale),
    headingFont: toInt(30 * uiScale),
    bodyFont: toInt(18 * uiScale),
    smallFont: toInt(15 * uiScale),
    hudFont: toInt(20 * clamp(uiScale, 0.9, 1.08)),
    hudCompactFont: toInt(17 * clamp(uiScale, 0.9, 1.08)),
    lineSpacing: toInt(5 * uiScale),
    buttonWidth: toInt(clamp(250 * uiScale, 220, 320)),
    buttonCompactWidth: toInt(clamp(190 * uiScale, 160, 250)),
    buttonHeight: toInt(clamp((isMobile ? 52 : 46) * uiScale, 42, 60)),
    buttonFont: toInt(clamp(19 * uiScale, 16, 24)),
    modalWidth: toInt(clamp(520 * uiScale, 420, 700)),
    modalLargeWidth: toInt(clamp(580 * uiScale, 480, 780))
  };
}
