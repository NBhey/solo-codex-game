import {
  ENEMY_FIRE_MAX_MS,
  ENEMY_FIRE_MIN_MS,
  ENEMY_SPAWN_DELAY_MS,
  MAX_ENEMIES_ON_FIELD
} from '../config/gameConfig';

export type EnemyPattern = 'chaser' | 'strafer' | 'dasher';

export interface WaveConfig {
  wave: number;
  spawnDelayMs: number;
  maxEnemiesOnField: number;
  enemySpeedMultiplier: number;
  enemyFireRateMultiplier: number;
  patternWeights: Record<EnemyPattern, number>;
}

const KILLS_PER_WAVE = 4;
const MIN_SPAWN_DELAY_MS = 560;
const MAX_ENEMIES_CAP = 12;

export function getWaveForKills(kills: number): number {
  const normalizedKills = Math.max(0, Math.floor(kills));
  return Math.floor(normalizedKills / KILLS_PER_WAVE) + 1;
}

export function getWaveConfig(kills: number): WaveConfig {
  const wave = getWaveForKills(kills);
  const waveProgress = wave - 1;

  return {
    wave,
    spawnDelayMs: Math.max(MIN_SPAWN_DELAY_MS, ENEMY_SPAWN_DELAY_MS - waveProgress * 120),
    maxEnemiesOnField: Math.min(MAX_ENEMIES_CAP, MAX_ENEMIES_ON_FIELD + Math.floor(waveProgress / 2)),
    enemySpeedMultiplier: 1 + Math.min(0.55, waveProgress * 0.08),
    enemyFireRateMultiplier: 1 + Math.min(0.5, waveProgress * 0.07),
    patternWeights: {
      chaser: Math.max(1, 6 - waveProgress),
      strafer: 2 + Math.min(4, waveProgress),
      dasher: wave >= 2 ? 1 + Math.floor((wave - 2) / 2) : 0
    }
  };
}

export function getEnemyFireDelayRange(config: WaveConfig): { minMs: number; maxMs: number } {
  const minMs = Math.max(320, Math.round(ENEMY_FIRE_MIN_MS / config.enemyFireRateMultiplier));
  const maxMs = Math.max(minMs + 120, Math.round(ENEMY_FIRE_MAX_MS / config.enemyFireRateMultiplier));
  return { minMs, maxMs };
}

export function pickEnemyPattern(randomValue: number, config: WaveConfig): EnemyPattern {
  const entries = Object.entries(config.patternWeights) as Array<[EnemyPattern, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);

  if (total <= 0) {
    return 'chaser';
  }

  const normalized = Math.min(0.999999, Math.max(0, randomValue)) * total;
  let cursor = 0;

  for (const [pattern, weight] of entries) {
    cursor += Math.max(0, weight);
    if (normalized < cursor) {
      return pattern;
    }
  }

  return 'chaser';
}
