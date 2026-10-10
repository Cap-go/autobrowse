import { registerPlugin } from '@capacitor/core';
import type { OAuthLoopbackPlugin } from './definitions';

export * from './definitions';

export const OAuthLoopback = registerPlugin<OAuthLoopbackPlugin>('OAuthLoopback', {
  web: () => import('./web').then((m) => m.default),
});
