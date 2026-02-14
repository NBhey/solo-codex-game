import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTextButtonPressController } from './textButtonPressController';

describe('textButtonPressController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once for a valid down/up gesture', () => {
    const press = createTextButtonPressController();

    expect(press.pointerDown(1)).toBe(true);
    expect(press.pointerUp(1, true)).toBe(true);
    expect(press.pointerUp(1, true)).toBe(false);
  });

  it('does not fire when pointer is released outside or cancelled', () => {
    const press = createTextButtonPressController();

    expect(press.pointerDown(3)).toBe(true);
    expect(press.pointerUp(3, false)).toBe(false);

    expect(press.pointerDown(4)).toBe(true);
    press.cancelPointer(4);
    expect(press.pointerUp(4, true)).toBe(false);
  });

  it('applies cooldown and ignores extra pointers while pressed', () => {
    const press = createTextButtonPressController(120);

    expect(press.pointerDown(7)).toBe(true);
    expect(press.pointerDown(8)).toBe(false);
    expect(press.pointerUp(7, true)).toBe(true);

    expect(press.pointerDown(7)).toBe(false);
    vi.advanceTimersByTime(121);
    expect(press.pointerDown(7)).toBe(true);
    expect(press.pointerUp(7, true)).toBe(true);
  });

  it('fully disables interaction when button is disabled', () => {
    const press = createTextButtonPressController();
    press.setEnabled(false);

    expect(press.pointerDown(1)).toBe(false);
    expect(press.pointerUp(1, true)).toBe(false);

    press.setEnabled(true);
    expect(press.pointerDown(1)).toBe(true);
  });
});
