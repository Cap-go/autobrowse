import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Track the software keyboard in `--kb` (px) and the `kb-open` class so the
 * layout shrinks above it. The native page frame follows through the
 * ResizeObserver in the browser screen.
 */
export function trackKeyboard(): void {
  if (!Capacitor.isNativePlatform()) return;
  const root = document.documentElement;
  const set = (height: number): void => {
    root.style.setProperty('--kb', `${Math.round(height)}px`);
    root.classList.toggle('kb-open', height > 0);
    // iOS may still nudge the document; keep it pinned.
    window.scrollTo(0, 0);
  };
  void Keyboard.addListener('keyboardWillShow', (info) => set(info.keyboardHeight));
  void Keyboard.addListener('keyboardWillHide', () => set(0));
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
}
