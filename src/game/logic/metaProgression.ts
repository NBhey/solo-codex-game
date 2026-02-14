export const MAX_HP_UPGRADE_CAP = 80;
export const HP_UPGRADE_BASE_COST = 35;
export const HP_UPGRADE_STEP_COST = 20;
export const CREDITS_PER_KILL = 4;
export const WIN_CREDITS_BONUS = 20;

export function getNextHpUpgradeCost(level: number): number {
  const normalized = Math.max(0, Math.floor(level));
  return HP_UPGRADE_BASE_COST + normalized * HP_UPGRADE_STEP_COST;
}

export function canBuyHpUpgrade(credits: number, level: number): boolean {
  const normalizedCredits = Math.max(0, Math.floor(credits));
  const normalizedLevel = Math.max(0, Math.floor(level));

  if (normalizedLevel >= MAX_HP_UPGRADE_CAP) {
    return false;
  }

  return normalizedCredits >= getNextHpUpgradeCost(normalizedLevel);
}

export function getRunCreditsReward(kills: number, didWin: boolean): number {
  const normalizedKills = Math.max(0, Math.floor(kills));
  const base = normalizedKills * CREDITS_PER_KILL;
  return didWin ? base + WIN_CREDITS_BONUS : base;
}
