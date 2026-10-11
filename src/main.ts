import { App } from './ui/app';
import { App as CapApp } from '@capacitor/app';
import { setAppActive } from './agent/lifecycle';
import { trackKeyboard } from './ui/keyboard';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

trackKeyboard();
void CapApp.addListener('appStateChange', ({ isActive }) => setAppActive(isActive));
const app = new App(root);
const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
if (demo) {
  void import('./ui/demo').then(({ runDemo }) => runDemo(app, demo));
} else {
  // Deep links: warm start (app already running) and cold start (launch URL).
  void CapApp.addListener('appUrlOpen', ({ url }) => app.handleDeepLink(url));
  void app.init().then(async () => {
    const launch = await CapApp.getLaunchUrl().catch(() => undefined);
    if (launch?.url) app.handleDeepLink(launch.url);
  });
}
