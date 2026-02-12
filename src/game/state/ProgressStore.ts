import { PROGRESS_STORAGE_KEY } from '../config/gameConfig';
import {
  canBuyHpUpgrade,
  getNextHpUpgradeCost,
  getRunCreditsReward,
  MAX_HP_UPGRADE_CAP
} from '../logic/metaProgression';
import { yandexService } from '../services/YandexService';

export interface GameProgress {
  bestScore: number;
  totalWins: number;
  totalLosses: number;
  totalKills: number;
  credits: number;
  hpUpgradeLevel: number;
  soundEnabled: boolean;
}

const DEFAULT_PROGRESS: GameProgress = {
  bestScore: 0,
  totalWins: 0,
  totalLosses: 0,
  totalKills: 0,
  credits: 0,
  hpUpgradeLevel: 0,
  soundEnabled: true
};

function asSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

class ProgressStore {
  private progress: GameProgress = { ...DEFAULT_PROGRESS };

  get data(): GameProgress {
    return this.progress;
  }

  async load(): Promise<void> {
    const raw = await yandexService.loadJson<Partial<GameProgress>>(PROGRESS_STORAGE_KEY, {
      ...DEFAULT_PROGRESS
    });
    this.progress = this.hydrate(raw);
  }

  async save(): Promise<void> {
    await yandexService.saveJson(PROGRESS_STORAGE_KEY, this.progress);
  }

  recordWin(score: number, kills: number): number {
    this.progress.totalWins += 1;
    this.progress.totalKills += kills;
    this.progress.bestScore = Math.max(this.progress.bestScore, score);
    const reward = getRunCreditsReward(kills, true);
    this.progress.credits += reward;
    return reward;
  }

  recordLoss(kills: number): number {
    this.progress.totalLosses += 1;
    this.progress.totalKills += kills;
    const reward = getRunCreditsReward(kills, false);
    this.progress.credits += reward;
    return reward;
  }

  toggleSound(): boolean {
    this.progress.soundEnabled = !this.progress.soundEnabled;
    return this.progress.soundEnabled;
  }

  getNextHpUpgradeCost(): number {
    return getNextHpUpgradeCost(this.progress.hpUpgradeLevel);
  }

  canPurchaseHpUpgrade(): boolean {
    return canBuyHpUpgrade(this.progress.credits, this.progress.hpUpgradeLevel);
  }

  purchaseHpUpgrade(): boolean {
    if (!this.canPurchaseHpUpgrade()) {
      return false;
    }

    const cost = this.getNextHpUpgradeCost();
    this.progress.credits = Math.max(0, this.progress.credits - cost);
    this.progress.hpUpgradeLevel += 1;
    return true;
  }

  getPlayerMaxHp(baseHp: number): number {
    return baseHp + this.progress.hpUpgradeLevel;
  }

  private hydrate(raw: Partial<GameProgress>): GameProgress {
    return {
      bestScore: asSafeNumber(raw.bestScore, DEFAULT_PROGRESS.bestScore),
      totalWins: asSafeNumber(raw.totalWins, DEFAULT_PROGRESS.totalWins),
      totalLosses: asSafeNumber(raw.totalLosses, DEFAULT_PROGRESS.totalLosses),
      totalKills: asSafeNumber(raw.totalKills, DEFAULT_PROGRESS.totalKills),
      credits: asSafeNumber(raw.credits, DEFAULT_PROGRESS.credits),
      hpUpgradeLevel: Math.min(
        MAX_HP_UPGRADE_CAP,
        asSafeNumber(raw.hpUpgradeLevel, DEFAULT_PROGRESS.hpUpgradeLevel)
      ),
      soundEnabled:
        typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULT_PROGRESS.soundEnabled
    };
  }
}

export const progressStore = new ProgressStore();
