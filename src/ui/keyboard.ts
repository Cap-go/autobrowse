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
    // Capacitor 8 SystemBars resizes the Android host for IME insets already.
    // Subtracting the height again would leave an empty gap above the keyboard.
    root.style.setProperty('--kb', `${Capacitor.getPlatform() === 'android' ? 0 : Math.round(height)}px`);
    root.classList.toggle('kb-open', height > 0);
    // iOS may still nudge the document; keep it pinned.
    window.scrollTo(0, 0);
  };
  void Keyboard.addListener('keyboardWillShow', (info) => set(info.keyboardHeight));
  void Keyboard.addListener('keyboardWillHide', () => set(0));
  void Keyboard.addListener('keyboardDidShow', (info) => set(info.keyboardHeight));
  void Keyboard.addListener('keyboardDidHide', () => {
    set(0);
    if (Capacitor.getPlatform() === 'android' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
}
