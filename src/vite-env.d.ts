interface ImportMetaEnv {
  readonly VITE_YANDEX_LEADERBOARD_NAME?: string;
  readonly VITE_FORCE_MOCK_SDK?: string;
  readonly VITE_DEBUG_ADS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
