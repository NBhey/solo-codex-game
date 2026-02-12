import { describe, expect, it } from 'vitest';
import { getEnemyFireDelayRange, getWaveConfig, getWaveForKills, pickEnemyPattern } from './waveSystem';

describe('waveSystem', () => {
  it('calculates wave index from kills', () => {
    expect(getWaveForKills(0)).toBe(1);
    expect(getWaveForKills(3)).toBe(1);
    expect(getWaveForKills(4)).toBe(2);
    expect(getWaveForKills(11)).toBe(3);
  });

  it('increases pressure by wave', () => {
    const waveOne = getWaveConfig(0);
    const waveFour = getWaveConfig(13);

    expect(waveFour.wave).toBeGreaterThan(waveOne.wave);
    expect(waveFour.spawnDelayMs).toBeLessThan(waveOne.spawnDelayMs);
    expect(waveFour.maxEnemiesOnField).toBeGreaterThanOrEqual(waveOne.maxEnemiesOnField);

    const fireOne = getEnemyFireDelayRange(waveOne);
    const fireFour = getEnemyFireDelayRange(waveFour);
    expect(fireFour.maxMs).toBeLessThan(fireOne.maxMs);
  });

  it('resolves enemy pattern using weights', () => {
    const config = getWaveConfig(10);
    const heavyConfig = {
      ...config,
      patternWeights: {
        chaser: 0,
        strafer: 100,
        dasher: 0
      }
    };

    expect(pickEnemyPattern(0.5, heavyConfig)).toBe('strafer');
  });
});
