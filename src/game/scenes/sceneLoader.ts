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
