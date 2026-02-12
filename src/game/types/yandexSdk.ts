export interface YandexStorage {
  setItem(key: string, value: string): void;
  getItem(key: string): string | null;
}

export interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

export interface YandexAdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onRewarded?: () => void;
  onError?: (error: unknown) => void;
}

export interface YandexLeaderboardEntry {
  rank: number;
  score: number;
  player?: {
    publicName?: string;
  };
}

export interface YandexSDK {
  adv?: {
    showFullscreenAdv(options?: { callbacks?: YandexAdvCallbacks }): void;
    showRewardedVideo(options?: { callbacks?: YandexAdvCallbacks }): void;
  };
  features?: {
    LoadingAPI?: {
      ready?: () => void;
    };
    GameplayAPI?: {
      start?: () => void;
      stop?: () => void;
    };
  };
  leaderboards?: {
    setScore(name: string, score: number): Promise<void>;
    getEntries(
      name: string,
      options?: {
        includeUser?: boolean;
        quantityTop?: number;
        quantityAround?: number;
      }
    ): Promise<{ entries?: YandexLeaderboardEntry[] }>;
  };
  getPlayer?: () => Promise<YandexPlayer>;
  getStorage?: () => Promise<YandexStorage>;
  isAvailableMethod?: (methodName: string) => boolean;
}

export interface YandexGlobal {
  init(options?: { signed?: boolean }): Promise<YandexSDK>;
}

declare global {
  interface Window {
    YaGames?: YandexGlobal;
  }
}
