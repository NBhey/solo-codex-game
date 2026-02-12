import { PROGRESS_STORAGE_KEY } from '../config/gameConfig';
import { yandexService } from '../services/YandexService';

export interface GameProgress {
  bestScore: number;
  totalWins: number;
  totalLosses: number;
  totalKills: number;
  soundEnabled: boolean;
}

const DEFAULT_PROGRESS: GameProgress = {
  bestScore: 0,
  totalWins: 0,
  totalLosses: 0,
  totalKills: 0,
  soundEnabled: true
};

class ProgressStore {
  private progress: GameProgress = { ...DEFAULT_PROGRESS };

  get data(): GameProgress {
    return this.progress;
  }

  async load(): Promise<void> {
    this.progress = await yandexService.loadJson<GameProgress>(PROGRESS_STORAGE_KEY, {
      ...DEFAULT_PROGRESS
    });
  }

  async save(): Promise<void> {
    await yandexService.saveJson(PROGRESS_STORAGE_KEY, this.progress);
  }

  recordWin(score: number, kills: number): void {
    this.progress.totalWins += 1;
    this.progress.totalKills += kills;
    this.progress.bestScore = Math.max(this.progress.bestScore, score);
  }

  recordLoss(kills: number): void {
    this.progress.totalLosses += 1;
    this.progress.totalKills += kills;
  }

  toggleSound(): boolean {
    this.progress.soundEnabled = !this.progress.soundEnabled;
    return this.progress.soundEnabled;
  }
}

export const progressStore = new ProgressStore();
