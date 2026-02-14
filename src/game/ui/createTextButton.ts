import Phaser from 'phaser';

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

  let enabled = true;

  container.on('pointerover', () => {
    if (enabled) {
      bg.setFillStyle(hoverColor, 1);
    }
  });

  container.on('pointerout', () => {
    if (enabled) {
      bg.setFillStyle(normalColor, 1);
    }
  });

  container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    if (!enabled) {
      return;
    }
    bg.setFillStyle(normalColor, 1);
    onClick();
  });

  container.setEnabled = (value: boolean) => {
    enabled = value;
    if (enabled) {
      enableInteraction();
      bg.setFillStyle(normalColor, 1);
      text.setAlpha(1);
    } else {
      container.disableInteractive();
      bg.setFillStyle(disabledColor, 1);
      text.setAlpha(0.8);
    }
  };

  return container;
}
