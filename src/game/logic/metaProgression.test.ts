import { describe, expect, it } from 'vitest';
import {
  canBuyHpUpgrade,
  getNextHpUpgradeCost,
  getRunCreditsReward,
  MAX_HP_UPGRADE_CAP
} from './metaProgression';

describe('metaProgression', () => {
  it('scales hp upgrade cost by level', () => {
    expect(getNextHpUpgradeCost(0)).toBeLessThan(getNextHpUpgradeCost(1));
    expect(getNextHpUpgradeCost(3)).toBe(95);
  });

  it('disallows purchases when credits are not enough or cap reached', () => {
    expect(canBuyHpUpgrade(10, 0)).toBe(false);
    expect(canBuyHpUpgrade(200, MAX_HP_UPGRADE_CAP)).toBe(false);
    expect(canBuyHpUpgrade(100, 1)).toBe(true);
  });

  it('grants higher reward for wins than losses', () => {
    const kills = 5;
    const lossReward = getRunCreditsReward(kills, false);
    const winReward = getRunCreditsReward(kills, true);

    expect(winReward).toBeGreaterThan(lossReward);
    expect(lossReward).toBe(20);
  });
});
