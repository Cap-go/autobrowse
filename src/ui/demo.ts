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
    // Mock page in the browser area (the real app overlays the native browser here).
    const section = document.querySelector('.screen.main');
    const slot = document.querySelector('.browser-slot');
    const label = document.querySelector('.page-label');
    if (section && slot && label) {
      section.classList.add('browser-on');
      slot.classList.add('loaded', 'demo-page');
      label.textContent = name === 'chat' ? 'news.ycombinator.com' : 'google.com/search';
      slot.replaceChildren(name === 'chat' ? mockNews() : mockShopping());
    }
    const input = document.querySelector('textarea');
    if (input) input.placeholder = 'Ask a follow up…';
  }
}

function mockNews(): HTMLElement {
  const items = [
    'A new open source browser engine written in Rust hits 1.0',
    'Why SQLite is quietly running your phone',
    'Show HN: a tiny CSS framework with zero classes',
    'The hidden cost of always-on notifications',
    'How we cut our cloud bill in half',
  ];
  return h(
    'div',
    { class: 'mock news' },
    h('div', { class: 'mock-top' }, h('b', {}, 'Hacker News'), h('span', {}, 'new | past | ask | show')),
    ...items.map((t, i) =>
      h('div', { class: `mock-row${i === 0 ? ' hit' : ''}` }, h('span', { class: 'n' }, `${i + 1}.`), h('div', {}, h('p', {}, t), h('small', {}, `${320 - i * 47} points · ${90 - i * 13} comments`))),
    ),
    h('div', { class: 'tap', style: 'left:58%;top:15%' }),
  );
}

function mockShopping(): HTMLElement {
  const rows = [
    ['Tech Depot', '$279', 'Free delivery'],
    ['MegaMart', '$289', 'Pickup today'],
    ['PixelShop', '$299', 'In stock'],
  ];
  return h(
    'div',
    { class: 'mock shop' },
    h('div', { class: 'mock-search' }, '27 inch 4K monitor'),
    h('p', { class: 'mock-sub' }, 'Shopping results'),
    ...rows.map(([store, price, note], i) =>
      h('div', { class: `mock-card${i === 0 ? ' hit' : ''}` }, h('div', { class: 'thumb' }), h('div', {}, h('p', {}, '27" 4K UHD IPS Monitor'), h('b', {}, String(price)), h('small', {}, `${store} · ${note}`))),
    ),
    h('div', { class: 'tap', style: 'left:70%;top:27%' }),
  );
}
