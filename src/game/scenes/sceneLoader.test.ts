import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { safeStartScene, safeStartSceneWithWatchdog } from './sceneLoader';

class MockEvents {
  private listeners = new Map<string, Array<() => void>>();

  once(event: string, callback: () => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(callback);
    this.listeners.set(event, current);
  }

  emit(event: string): void {
    const callbacks = this.listeners.get(event) ?? [];
    this.listeners.delete(event);
    callbacks.forEach((callback) => callback());
  }
}

interface MockSceneOptions {
  throwOnStart?: boolean;
  throwOnManagerStart?: boolean;
  activateTargetOnStart?: boolean;
}

function createMockScene(options: MockSceneOptions = {}): {
  scene: Phaser.Scene;
  events: MockEvents;
  calls: string[];
  setSourceActive: (active: boolean) => void;
  setSceneActive: (key: string, active: boolean) => void;
} {
  const calls: string[] = [];
  const events = new MockEvents();
  const activeScenes = new Set<string>();
  let sourceActive = true;
  const activateTargetOnStart = options.activateTargetOnStart ?? true;

  const markStarted = (key: string): void => {
    if (activateTargetOnStart) {
      activeScenes.add(key);
    }
    sourceActive = false;
  };

  const scene = {
    events,
    scene: {
      key: 'MockScene',
      start: (key: string): void => {
        calls.push(`scene.start:${key}`);
        if (options.throwOnStart) {
          throw new Error('scene.start failed');
        }
        markStarted(key);
      },
      manager: {
        start: (key: string): void => {
          calls.push(`scene.manager.start:${key}`);
          if (options.throwOnManagerStart) {
            throw new Error('scene.manager.start failed');
          }
          markStarted(key);
        }
      },
      isActive: (key?: string): boolean => (key ? activeScenes.has(key) : sourceActive),
      isPaused: (): boolean => false,
      isSleeping: (): boolean => false,
      get: (): undefined => undefined
    }
  } as unknown as Phaser.Scene;

  return {
    scene,
    events,
    calls,
    setSourceActive: (active: boolean) => {
      sourceActive = active;
    },
    setSceneActive: (key: string, active: boolean) => {
      if (active) {
        activeScenes.add(key);
        return;
      }
      activeScenes.delete(key);
    }
  };
}

describe('sceneLoader safe starts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts target scene with primary API', () => {
    const mock = createMockScene();
    expect(safeStartScene(mock.scene, 'GameScene')).toBe(true);
    expect(mock.calls).toEqual(['scene.start:GameScene']);
  });

  it('falls back to scene manager when primary start throws', () => {
    const mock = createMockScene({ throwOnStart: true });
    expect(safeStartScene(mock.scene, 'MainMenuScene')).toBe(true);
    expect(mock.calls).toEqual(['scene.start:MainMenuScene', 'scene.manager.start:MainMenuScene']);
  });

  it('fires watchdog fallback when target scene is not running', () => {
    const mock = createMockScene({ activateTargetOnStart: false });
    safeStartSceneWithWatchdog(mock.scene, 'WinScene', undefined, {
      fallbackKey: 'MainMenuScene',
      timeoutMs: 250,
      shouldFallback: () => true
    });

    expect(mock.calls).toEqual(['scene.start:WinScene']);
    vi.advanceTimersByTime(260);
    expect(mock.calls).toEqual(['scene.start:WinScene', 'scene.start:MainMenuScene']);
  });

  it('does not fire watchdog fallback when target scene is active', () => {
    const mock = createMockScene();
    safeStartSceneWithWatchdog(mock.scene, 'WinScene', undefined, {
      fallbackKey: 'MainMenuScene',
      timeoutMs: 250
    });
    vi.advanceTimersByTime(260);

    expect(mock.calls).toEqual(['scene.start:WinScene']);
  });

  it('can fallback even if source scene already became inactive', () => {
    const mock = createMockScene({ activateTargetOnStart: false });
    safeStartSceneWithWatchdog(mock.scene, 'WinScene', undefined, {
      fallbackKey: 'MainMenuScene',
      timeoutMs: 250,
      shouldFallback: () => true
    });
    mock.setSourceActive(false);
    vi.advanceTimersByTime(260);

    expect(mock.calls).toEqual(['scene.start:WinScene', 'scene.start:MainMenuScene']);
  });
});
