import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.capgo.browser',
  appName: 'Auto Browse',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SecureStoragePlugin: {},
  },
};

export default config;
