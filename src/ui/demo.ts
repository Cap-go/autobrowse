/** Dev-only states used to capture App Store screenshots: /?demo=<name>. */
import type { OAuthCredentialRecord } from '../auth/types';
import type { App } from './app';
import { h, icon } from './dom';

const fakeCreds = {
  email: 'alex@example.com',
  clientId: 'demo',
  accessToken: 'demo',
  expiresAtMs: Date.now() + 3_600_000,
} as OAuthCredentialRecord;

export async function runDemo(app: App, name: string): Promise<void> {
  if (name.startsWith('onboarding')) {
    await app.init({ creds: null, screen: 'onboarding' });
    const step = Number(name.split('-')[1] ?? 0);
    for (let i = 0; i < step; i += 1) {
      document.querySelector<HTMLButtonElement>('.onboarding-footer .primary')?.click();
    }
    return;
  }
  if (name === 'connect') {
    await app.init({ creds: null, screen: 'connect' });
    return;
  }
  await app.init({ creds: fakeCreds, screen: 'main' });
  if (name === 'settings') {
    app.openSettings();
    return;
  }
  if (name === 'chat' || name === 'shopping') {
    const log = document.querySelector('.chat-log');
    if (!log) return;
    log.replaceChildren();
    const script =
      name === 'chat'
        ? {
            user: 'Open Hacker News and summarize the top 3 stories.',
            tools: [
              ['Opening news.ycombinator.com', true],
              ['Reading the page', true],
            ],
            answer:
              'Here are today’s top 3 on Hacker News:\n\n1. A new open source browser engine written in Rust hits 1.0.\n2. Why SQLite is quietly running your phone.\n3. Show HN: a tiny CSS framework with zero classes.\n\nWant me to open one of them?',
          }
        : {
            user: 'Find the best price for a 27 inch 4K monitor and list the top 3 stores.',
            tools: [
              ['Opening google.com', true],
              ['Typing “27 inch 4K monitor”', true],
              ['Reading the page', true],
              ['Extracting details', true],
            ],
            answer:
              'Best prices I found right now:\n\n• Tech Depot — $279, free delivery\n• MegaMart — $289, pickup today\n• PixelShop — $299\n\nTech Depot is the cheapest. Should I open the product page?',
          };
    log.append(h('div', { class: 'bubble user' }, script.user));
    const activity = h('div', { class: 'activity' });
    for (const [label, done] of script.tools) {
      activity.append(
        h(
          'div',
          { class: `tool-chip ${done ? 'done' : ''}` },
          h('span', { class: 'spinner' }),
          icon('check', 'icon ok'),
          h('span', {}, String(label)),
        ),
      );
    }
    log.append(activity, h('div', { class: 'bubble assistant' }, script.answer));
    const input = document.querySelector('textarea');
    if (input) input.placeholder = 'Ask a follow up…';
  }
}
