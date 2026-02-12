import type Phaser from 'phaser';

const OVERLAY_ID = 'orientation-guard-overlay';

export class OrientationGuard {
  private readonly game: Phaser.Game;
  private readonly overlay: HTMLDivElement;
  private blocked = false;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.overlay = this.ensureOverlay();

    window.addEventListener('resize', this.evaluate, { passive: true });
    window.addEventListener('orientationchange', this.evaluate, { passive: true });

    if (window.screen.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', this.evaluate);
    }

    this.evaluate();
  }

  destroy(): void {
    window.removeEventListener('resize', this.evaluate);
    window.removeEventListener('orientationchange', this.evaluate);

    if (window.screen.orientation?.removeEventListener) {
      window.screen.orientation.removeEventListener('change', this.evaluate);
    }

    this.overlay.remove();
  }

  private evaluate = (): void => {
    this.game.scale.refresh();
    const shouldBlock = this.isPhoneLike() && this.isPortrait();

    if (shouldBlock === this.blocked) {
      return;
    }

    this.blocked = shouldBlock;
    if (this.blocked) {
      this.overlay.style.display = 'flex';
      this.game.loop.sleep();
      return;
    }

    this.overlay.style.display = 'none';
    this.game.loop.wake();
  };

  private isPhoneLike(): boolean {
    const shortestSide = Math.min(window.innerWidth, window.innerHeight);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return coarsePointer && shortestSide <= 900;
  }

  private isPortrait(): boolean {
    return window.innerHeight > window.innerWidth;
  }

  private ensureOverlay(): HTMLDivElement {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      return existing as HTMLDivElement;
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.gap = '14px';
    overlay.style.padding = '24px';
    overlay.style.background = 'rgba(5, 10, 28, 0.95)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '10000';
    overlay.style.pointerEvents = 'all';
    overlay.style.textAlign = 'center';
    overlay.style.color = '#e5edf8';
    overlay.style.fontFamily = 'Arial, sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Поверните устройство горизонтально';
    title.style.fontSize = 'clamp(22px, 5vw, 34px)';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '0.02em';

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Landscape mode is required to continue.';
    subtitle.style.fontSize = 'clamp(14px, 3.2vw, 20px)';
    subtitle.style.opacity = '0.9';

    overlay.append(title, subtitle);
    document.body.appendChild(overlay);
    return overlay;
  }
}
