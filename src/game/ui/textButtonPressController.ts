export interface TextButtonPressController {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  isPressed: () => boolean;
  pointerDown: (pointerId: number) => boolean;
  pointerUp: (pointerId: number, isInside: boolean) => boolean;
  cancelPointer: (pointerId: number) => void;
}

export function createTextButtonPressController(cooldownMs: number = 120): TextButtonPressController {
  let enabled = true;
  let pressed = false;
  let activePointerId: number | null = null;
  let clickLockedUntil = 0;

  return {
    setEnabled(value: boolean): void {
      enabled = value;
      if (!value) {
        pressed = false;
        activePointerId = null;
      }
    },
    isEnabled(): boolean {
      return enabled;
    },
    isPressed(): boolean {
      return pressed;
    },
    pointerDown(pointerId: number): boolean {
      if (!enabled || activePointerId !== null || Date.now() < clickLockedUntil) {
        return false;
      }

      activePointerId = pointerId;
      pressed = true;
      return true;
    },
    pointerUp(pointerId: number, isInside: boolean): boolean {
      if (pointerId !== activePointerId) {
        return false;
      }

      activePointerId = null;
      const shouldFire = enabled && pressed && isInside && Date.now() >= clickLockedUntil;
      pressed = false;

      if (shouldFire) {
        clickLockedUntil = Date.now() + cooldownMs;
      }
      return shouldFire;
    },
    cancelPointer(pointerId: number): void {
      if (pointerId !== activePointerId) {
        return;
      }

      activePointerId = null;
      pressed = false;
    }
  };
}
