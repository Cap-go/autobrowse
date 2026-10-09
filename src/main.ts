import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

const app = new App(root);
void app.init();
