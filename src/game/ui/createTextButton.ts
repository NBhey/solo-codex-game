import Phaser from 'phaser';
import { createTextButtonPressController } from './textButtonPressController';

export interface TextButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  normalColor?: number;
  hoverColor?: number;
  disabledColor?: number;
  textColor?: string;
}

export type TextButton = Phaser.GameObjects.Container & {
  setEnabled: (enabled: boolean) => void;
};

export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: TextButtonOptions = {}
): TextButton {
  const width = options.width ?? 250;
  const height = options.height ?? 46;
  const normalColor = options.normalColor ?? 0x243d5a;
  const hoverColor = options.hoverColor ?? 0x2f5c88;
  const disabledColor = options.disabledColor ?? 0x4b5563;
  const textColor = options.textColor ?? '#f8fafc';
  const fontSize = options.fontSize ?? 20;

  const container = scene.add.container(x, y) as TextButton;
  const bg = scene.add
    .rectangle(0, 0, width, height, normalColor, 1)
    .setStrokeStyle(2, 0x90cdf4, 0.75);
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: 'Arial',
      fontSize: `${fontSize}px`,
      color: textColor
    })
    .setOrigin(0.5);

  container.setSize(width, height);
  container.add([bg, text]);

  const enableInteraction = (): void => {
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    if (container.input) {
      container.input.cursor = 'pointer';
    }
  };

  enableInteraction();

  const press = createTextButtonPressController();

  const isPointerInside = (pointer: Phaser.Input.Pointer): boolean => {
    const bounds = container.getBounds();
    return bounds.contains(pointer.x, pointer.y);
  };

  const applyVisualState = (): void => {
    if (!press.isEnabled()) {
      bg.setFillStyle(disabledColor, 1);
      text.setAlpha(0.8);
      return;
    }

    bg.setFillStyle(press.isPressed() ? hoverColor : normalColor, 1);
    text.setAlpha(1);
  };

  container.on('pointerover', () => {
    if (press.isEnabled() && !press.isPressed()) {
      bg.setFillStyle(hoverColor, 1);
    }
  });

  container.on('pointerout', (pointer: Phaser.Input.Pointer) => {
    press.cancelPointer(pointer.id);
    if (press.isEnabled()) {
      bg.setFillStyle(normalColor, 1);
    }
  });

  container.on(
    'pointerdown',
    (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (!press.pointerDown(pointer.id)) {
        return;
      }
      bg.setFillStyle(hoverColor, 1);
    }
  );

  container.on(
    'pointerup',
    (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      const shouldFire = press.pointerUp(pointer.id, isPointerInside(pointer));
      applyVisualState();
      if (!shouldFire) {
        return;
      }
      onClick();
    }
  );

  container.on('pointerupoutside', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    press.cancelPointer(pointer.id);
    applyVisualState();
  });

  container.setEnabled = (value: boolean) => {
    press.setEnabled(value);
    if (press.isEnabled()) {
      enableInteraction();
    } else {
      container.disableInteractive();
    }
    applyVisualState();
  };

  if (!press.isEnabled()) {
    container.disableInteractive();
  }

  applyVisualState();

  container.on('destroy', () => {
    container.removeAllListeners();
  });

  return container;
}
