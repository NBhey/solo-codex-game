import type { EnemyPattern } from '../logic/waveSystem';

export type LevelId = 1 | 3;
export type LevelEnemyKind = 'standard' | 'blue' | 'purple' | 'green';

export interface LevelWaveConfig {
  startKills: number;
  spawnDelayMs: number;
  maxEnemiesOnField: number;
  enemySpeedMultiplier: number;
  enemyFireRateMultiplier: number;
  patternWeights: Record<EnemyPattern, number>;
  enemyKinds: LevelEnemyKind[];
}

export interface GameLevelConfig {
  id: LevelId;
  title: string;
  menuSubtitle: string;
  killsToWin: number;
  showWaveHud: boolean;
  waves: LevelWaveConfig[];
}

const LEVEL_CONFIGS: Record<LevelId, GameLevelConfig> = {
  1: {
    id: 1,
    title: 'Level 1',
    menuSubtitle: 'No waves, 10 enemies, red + blue only',
    killsToWin: 10,
    showWaveHud: false,
    waves: [
      {
        startKills: 0,
        spawnDelayMs: 1150,
        maxEnemiesOnField: 10,
        enemySpeedMultiplier: 1,
        enemyFireRateMultiplier: 1,
        patternWeights: {
          chaser: 6,
          strafer: 2,
          dasher: 0
        },
        enemyKinds: ['standard', 'blue']
      }
    ]
  },
  3: {
    id: 3,
    title: 'Level 3',
    menuSubtitle: '20 enemies, wave 2 starts after 10 kills',
    killsToWin: 20,
    showWaveHud: true,
    waves: [
      {
        startKills: 0,
        spawnDelayMs: 1100,
        maxEnemiesOnField: 8,
        enemySpeedMultiplier: 1.05,
        enemyFireRateMultiplier: 1.08,
        patternWeights: {
          chaser: 4,
          strafer: 3,
          dasher: 0
        },
        enemyKinds: ['standard', 'blue']
      },
      {
        startKills: 10,
        spawnDelayMs: 860,
        maxEnemiesOnField: 10,
        enemySpeedMultiplier: 1.2,
        enemyFireRateMultiplier: 1.22,
        patternWeights: {
          chaser: 3,
          strafer: 4,
          dasher: 1
        },
        enemyKinds: ['standard', 'blue', 'purple', 'green']
      }
    ]
  }
};

export const PLAYABLE_LEVELS = [LEVEL_CONFIGS[1], LEVEL_CONFIGS[3]] as const;

export function getLevelConfig(levelId?: number): GameLevelConfig {
  if (levelId === 3) {
    return LEVEL_CONFIGS[3];
  }
  return LEVEL_CONFIGS[1];
}
