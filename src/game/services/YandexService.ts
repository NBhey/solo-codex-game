import { DEBUG_ADS, FORCE_MOCK_SDK, YANDEX_LEADERBOARD_NAME } from '../config/yandexConfig';
import type {
  YandexLeaderboardEntry,
  YandexPlayer,
  YandexSDK,
  YandexStorage
} from '../types/yandexSdk';

export interface LeaderboardRow {
  rank: number;
  score: number;
  name: string;
}

class YandexService {
  private sdk?: YandexSDK;
  private player?: YandexPlayer;
  private storage?: YandexStorage;
  private initialized = false;
  private mockMode = false;
  private gameplayMarked = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (FORCE_MOCK_SDK) {
      this.enableMockMode('VITE_FORCE_MOCK_SDK=true');
      return;
    }

    try {
      await this.ensureSdkScriptLoaded();
    } catch (error) {
      console.warn('[YandexService] Failed to load /sdk.js, switching to mock mode.', error);
      this.enableMockMode('SDK script load failed');
      return;
    }

    const apiReady = await this.waitForYaGamesGlobal(5000);
    if (!apiReady || !window.YaGames) {
      this.enableMockMode('YaGames global is not available');
      return;
    }

    try {
      this.sdk = await window.YaGames.init();
      this.player = await this.safeAwait(() => this.sdk?.getPlayer?.());
      this.storage = await this.safeAwait(() => this.sdk?.getStorage?.());
      this.initialized = true;
    } catch (error) {
      console.warn('[YandexService] Failed to initialize SDK, switching to mock mode.', error);
      this.enableMockMode('SDK init failed');
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  getLeaderboardName(): string {
    return YANDEX_LEADERBOARD_NAME;
  }

  markLoadingReady(): void {
    if (this.mockMode) {
      return;
    }
    this.sdk?.features?.LoadingAPI?.ready?.();
  }

  markGameplayStart(): void {
    if (this.mockMode || this.gameplayMarked) {
      return;
    }
    this.gameplayMarked = true;
    this.sdk?.features?.GameplayAPI?.start?.();
  }

  markGameplayStop(): void {
    if (this.mockMode || !this.gameplayMarked) {
      return;
    }
    this.gameplayMarked = false;
    this.sdk?.features?.GameplayAPI?.stop?.();
  }

  async showInterstitial(): Promise<boolean> {
    if (this.mockMode || !this.sdk?.adv?.showFullscreenAdv) {
      return this.runMockInterstitial();
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(false);
      }, 3500);

      this.sdk?.adv?.showFullscreenAdv({
        callbacks: {
          onClose: (wasShown) => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(Boolean(wasShown));
          },
          onError: () => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(false);
          }
        }
      });
    });
  }

  async showRewarded(): Promise<boolean> {
    if (this.mockMode || !this.sdk?.adv?.showRewardedVideo) {
      return this.runMockRewarded();
    }

    return new Promise<boolean>((resolve) => {
      let rewarded = false;
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(false);
      }, 12000);

      this.sdk?.adv?.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(rewarded);
          },
          onError: () => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(false);
          }
        }
      });
    });
  }

  async loadJson<T>(key: string, fallback: T): Promise<T> {
    const fromPlayer = await this.loadFromPlayer<T>(key);
    if (fromPlayer !== null) {
      return fromPlayer;
    }

    const fromStorage = this.loadFromStorage<T>(key);
    if (fromStorage !== null) {
      return fromStorage;
    }

    return fallback;
  }

  async saveJson<T>(key: string, value: T): Promise<void> {
    await this.saveToPlayer(key, value);
    this.saveToStorage(key, value);
  }

  async submitScore(score: number, leaderboardName: string = YANDEX_LEADERBOARD_NAME): Promise<void> {
    if (this.mockMode || !this.sdk?.leaderboards?.setScore) {
      this.saveMockLeaderboardScore(score);
      return;
    }

    if (this.sdk.isAvailableMethod && !this.sdk.isAvailableMethod('leaderboards.setScore')) {
      return;
    }

    try {
      await this.sdk.leaderboards.setScore(leaderboardName, Math.max(0, Math.floor(score)));
    } catch (error) {
      console.warn('[YandexService] setScore failed', error);
    }
  }

  async getLeaderboardTop(
    count: number = 5,
    leaderboardName: string = YANDEX_LEADERBOARD_NAME
  ): Promise<LeaderboardRow[]> {
    if (this.mockMode || !this.sdk?.leaderboards?.getEntries) {
      return this.getMockLeaderboardRows(count);
    }

    if (this.sdk.isAvailableMethod && !this.sdk.isAvailableMethod('leaderboards.getEntries')) {
      return [];
    }

    try {
      const data = await this.sdk.leaderboards.getEntries(leaderboardName, {
        quantityTop: count,
        includeUser: false
      });

      const entries = data.entries ?? [];
      return entries.slice(0, count).map((entry, index) => this.mapLeaderboardEntry(entry, index));
    } catch (error) {
      console.warn('[YandexService] getEntries failed', error);
      return [];
    }
  }

  private mapLeaderboardEntry(entry: YandexLeaderboardEntry, index: number): LeaderboardRow {
    return {
      rank: typeof entry.rank === 'number' ? entry.rank : index + 1,
      score: typeof entry.score === 'number' ? entry.score : 0,
      name: entry.player?.publicName || 'Player'
    };
  }

  private async ensureSdkScriptLoaded(): Promise<void> {
    if (typeof document === 'undefined' || window.YaGames) {
      return;
    }

    const existing = document.querySelector('script[data-yandex-sdk="true"]') as HTMLScriptElement | null;
    if (existing) {
      await this.waitForYaGamesGlobal(5000);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/sdk.js';
      script.async = true;
      script.dataset.yandexSdk = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load /sdk.js'));
      document.head.appendChild(script);
    });
  }

  private async waitForYaGamesGlobal(timeoutMs: number): Promise<boolean> {
    const started = Date.now();

    while (!window.YaGames && Date.now() - started < timeoutMs) {
      await this.delay(100);
    }

    return Boolean(window.YaGames);
  }

  private enableMockMode(reason: string): void {
    console.warn(`[YandexService] Mock mode enabled: ${reason}`);
    this.mockMode = true;
    this.initialized = true;
  }

  private async runMockInterstitial(): Promise<boolean> {
    if (DEBUG_ADS) {
      window.alert('Mock interstitial: shown between retries.');
    } else {
      await this.delay(500);
    }
    return true;
  }

  private async runMockRewarded(): Promise<boolean> {
    if (DEBUG_ADS) {
      return window.confirm('Mock rewarded: grant reward and restart run?');
    }

    await this.delay(700);
    return true;
  }

  private async loadFromPlayer<T>(key: string): Promise<T | null> {
    if (!this.player) {
      return null;
    }

    try {
      const data = await this.player.getData([key]);
      const value = data[key];

      if (value === undefined || value === null) {
        return null;
      }

      return value as T;
    } catch (error) {
      console.warn('[YandexService] player.getData failed', error);
      return null;
    }
  }

  private async saveToPlayer<T>(key: string, value: T): Promise<void> {
    if (!this.player) {
      return;
    }

    try {
      await this.player.setData({ [key]: value }, true);
    } catch (error) {
      console.warn('[YandexService] player.setData failed', error);
    }
  }

  private loadFromStorage<T>(key: string): T | null {
    try {
      const raw = this.storage?.getItem(key) ?? window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn('[YandexService] storage read failed', error);
      return null;
    }
  }

  private saveToStorage<T>(key: string, value: T): void {
    const serialized = JSON.stringify(value);

    try {
      this.storage?.setItem(key, serialized);
    } catch (error) {
      console.warn('[YandexService] safe storage write failed', error);
    }

    try {
      window.localStorage.setItem(key, serialized);
    } catch (error) {
      console.warn('[YandexService] localStorage write failed', error);
    }
  }

  private saveMockLeaderboardScore(score: number): void {
    try {
      const key = this.mockLeaderboardKey();
      const currentValue = Number(window.localStorage.getItem(key) || '0');
      const nextValue = Math.max(currentValue, Math.floor(score));
      window.localStorage.setItem(key, String(nextValue));
    } catch (error) {
      console.warn('[YandexService] mock leaderboard write failed', error);
    }
  }

  private getMockLeaderboardRows(count: number): LeaderboardRow[] {
    try {
      const key = this.mockLeaderboardKey();
      const topScore = Number(window.localStorage.getItem(key) || '0');
      const mockRows: LeaderboardRow[] = [];

      if (topScore > 0) {
        mockRows.push({ rank: 1, score: topScore, name: 'You (mock)' });
      }

      while (mockRows.length < Math.max(1, count)) {
        const idx = mockRows.length + 1;
        mockRows.push({
          rank: idx,
          score: Math.max(0, topScore - idx * 120),
          name: `Bot ${idx}`
        });
      }

      return mockRows.slice(0, count);
    } catch {
      return [];
    }
  }

  private mockLeaderboardKey(): string {
    return `mock-lb:${YANDEX_LEADERBOARD_NAME}`;
  }

  private async safeAwait<T>(factory: () => Promise<T | undefined> | undefined): Promise<T | undefined> {
    try {
      const promise = factory();
      return promise ? await promise : undefined;
    } catch {
      return undefined;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}

export const yandexService = new YandexService();
