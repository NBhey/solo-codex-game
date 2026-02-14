import type Phaser from 'phaser';

export async function ensureSceneRegistered(
  scene: Phaser.Scene,
  key: string,
  loader: () => Promise<Phaser.Types.Scenes.SceneType>
): Promise<void> {
  if (isSceneRegistered(scene, key)) {
    return;
  }

  const sceneType = await loader();
  scene.scene.add(key, sceneType, false);
}

export function isSceneRegistered(scene: Phaser.Scene, key: string): boolean {
  try {
    return Boolean(scene.scene.get(key));
  } catch {
    return false;
  }
}

interface SafeStartOptions {
  fallbackKey?: string;
  timeoutMs?: number;
  shouldFallback?: () => boolean;
}

export function safeStartScene(scene: Phaser.Scene, key: string, data?: object): boolean {
  try {
    scene.scene.start(key, data);
    return true;
  } catch (error) {
    console.error(`[${scene.scene.key}] scene.start(${key}) failed`, error);
  }

  try {
    scene.scene.manager.start(key, data);
    return true;
  } catch (error) {
    console.error(`[${scene.scene.key}] scene.manager.start(${key}) failed`, error);
  }

  return false;
}

function isSceneRunning(scene: Phaser.Scene, key: string): boolean {
  try {
    return (
      scene.scene.isActive(key) ||
      scene.scene.isPaused(key) ||
      scene.scene.isSleeping(key)
    );
  } catch {
    return false;
  }
}

export function safeStartSceneWithWatchdog(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  options: SafeStartOptions = {}
): boolean {
  const fallbackKey = options.fallbackKey ?? 'MainMenuScene';
  const timeoutMs = options.timeoutMs ?? 1400;
  const shouldFallback = options.shouldFallback ?? (() => true);

  const started = safeStartScene(scene, key, data);
  if (!started) {
    safeStartScene(scene, fallbackKey);
    return false;
  }

  globalThis.setTimeout(() => {
    if (isSceneRunning(scene, key) || !shouldFallback()) {
      return;
    }
    if (fallbackKey === key || isSceneRunning(scene, fallbackKey)) {
      return;
    }
    console.error(`[${scene.scene.key}] Transition watchdog fired for ${key}, fallback -> ${fallbackKey}`);
    safeStartScene(scene, fallbackKey);
  }, timeoutMs);

  return true;
}
