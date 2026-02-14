# Phaser 3 + Yandex Games SDK v2 Template

Production-ready starter project for **Phaser 3 + TypeScript + Vite** with **Yandex Games SDK v2** integration:
- Interstitial ads
- Rewarded ads API wrapper in `YandexService`
- Progress save/load
- Leaderboard submit/read
- SDK readiness checks before entering gameplay

## Install and Run

### 1) Install dependencies

```bash
npm install
```

### 2) Run development server

```bash
npm run dev
```

Open URL from Vite output (usually `http://localhost:5173`).

## Mobile Orientation Requirement

- Phone portrait mode is blocked by an overlay: `Поверните устройство горизонтально`.
- The game resumes automatically after rotating to landscape.
- During gameplay on touch devices, left half is movement zone and right half is aim/shoot zone.

### 3) Type-check

```bash
npm run typecheck
```

### 4) Build production bundle

```bash
npm run build
```

### 5) Preview production build

```bash
npm run preview
```

## Environment Settings

Create `.env` from `.env.example`:

```env
VITE_YANDEX_LEADERBOARD_NAME=triangle_arena_speed
VITE_FORCE_MOCK_SDK=false
VITE_DEBUG_ADS=false
```

- `VITE_YANDEX_LEADERBOARD_NAME`: leaderboard ID created in Yandex Games console.
- `VITE_FORCE_MOCK_SDK=true`: force mock SDK mode for local debugging.
- `VITE_DEBUG_ADS=true`: show mock ad dialogs (`alert/confirm`) for manual ad-flow testing.

## Sprite Sheet Setup

Use either full sheet or separate files.

Option A: full sheet

```text
public/assets/ships.png
```

The game auto-detects and crops:
- green ship -> player (`player-ship`)
- red ship -> enemy (`enemy-red-ship`)
- yellow ship -> enemy (`enemy-yellow-ship`)

Option B: separate files (highest priority)

```text
public/assets/player-ship.png
public/assets/enemy-red-ship.png
public/assets/enemy-yellow-ship.png
```

If none of these assets are available, game falls back to generated triangle textures.

## Yandex SDK Notes

No separate API key is required in code.
The SDK script is loaded dynamically from `/sdk.js` inside `YandexService`.

In local development, Vite proxy forwards `/sdk.js` to the official Yandex SDK URL.

## Ad Flow

### Interstitial ad

Shown:
- before starting gameplay from Main Menu;
- after pressing restart on Game Over (in the new run, before gameplay starts);
- before restarting from Win scene.

### Rewarded ad

`showRewarded()` is implemented in `YandexService` and ready to use if you decide to add rewarded gates later.

## Progress Storage

`ProgressStore` keeps:
- best score
- total wins/losses
- total kills
- sound flag

Save/load pipeline:
1. `player.getData/setData` (when available)
2. `safeStorage` / `localStorage` fallback

## Publish to Yandex Games

1. Run `npm run build`.
2. Archive contents of `dist/`.
3. Upload archive to Yandex Games draft.
4. Create leaderboard with ID equal to `VITE_YANDEX_LEADERBOARD_NAME`.
5. Verify ads, storage and leaderboard in platform environment.

## Scene Overview

- `BootScene`: SDK init + progress load
- `PreloaderScene`: sprite-sheet crop + geometry fallback generation
- `MainMenuScene`: Start / Leaderboard / Settings
- `GameScene`: gameplay loop (desktop: WASD + LMB, mobile: touch left to move / touch right to aim+shoot, infinite flight area with follow camera, win at 24 kills across 6 waves)
- `GameOverScene`: loss + instant restart button
- `WinScene`: win result + leaderboard preview
