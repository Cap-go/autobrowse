import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.capgo.browser',
  appName: 'Capgo Browser',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SecureStoragePlugin: {},
  },
};

export default config;
