import { App } from './ui/app';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { setAppActive } from './agent/lifecycle';
import { trackKeyboard } from './ui/keyboard';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

/** Tell Capgo this bundle works, only once the app rendered (otherwise it rolls back automatically). */
const appReady = (): void => {
  if (Capacitor.isNativePlatform()) void CapacitorUpdater.notifyAppReady().catch(() => undefined);
};
trackKeyboard();
void CapApp.addListener('appStateChange', ({ isActive }) => setAppActive(isActive));
const app = new App(root);
if (Capacitor.getPlatform() === 'android') {
  void CapApp.addListener('backButton', () => {
    void app.handleBack().then((handled) => {
      if (!handled) void CapApp.minimizeApp();
    });
  });
}
const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
if (demo) {
  void import('./ui/demo').then(({ runDemo }) => runDemo(app, demo));
} else {
  // Deep links: warm start (app already running) and cold start (launch URL).
  // On a cold start both can report the same link: handle it once.
  let lastLink = { url: '', at: 0 };
  const openLink = (url: string): void => {
    const now = Date.now();
    if (url === lastLink.url && now - lastLink.at < 3_000) return;
    lastLink = { url, at: now };
    app.handleDeepLink(url);
  };
  void CapApp.addListener('appUrlOpen', ({ url }) => openLink(url));
  void app
    .init()
    .then(async () => {
      appReady();
      const launch = await CapApp.getLaunchUrl().catch(() => undefined);
      if (launch?.url) openLink(launch.url);
    })
    .catch((error: unknown) => {
      // Not marked ready: Capgo rolls a broken live update back on next launch.
      root.textContent = `Auto Browse could not start. Close and reopen the app. (${error instanceof Error ? error.message : String(error)})`;
    });
}
