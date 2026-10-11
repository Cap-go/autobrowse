import { App } from './ui/app';
import { trackKeyboard } from './ui/keyboard';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

trackKeyboard();
const app = new App(root);
const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
if (demo) {
  void import('./ui/demo').then(({ runDemo }) => runDemo(app, demo));
} else {
  void app.init();
}
