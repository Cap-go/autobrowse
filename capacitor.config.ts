import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'app.capgo.browser',
  appName: 'Auto Browse',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    // The UI manages its own scrolling; never let iOS scroll the whole app
    // (it pushed the address bar away when the keyboard opened).
    scrollEnabled: false,
  },
  plugins: {
    SecureStoragePlugin: {},
    Keyboard: {
      // The layout shrinks itself by the keyboard height (see src/ui/keyboard.ts)
      // so the native page frame can follow.
      resize: KeyboardResize.None,
    },
  },
};

export default config;
