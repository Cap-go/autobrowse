/** Dev-only states used to capture App Store screenshots: /?demo=<name>. */
import type { OAuthCredentialRecord } from '../auth/types';
import type { App } from './app';
import { h, icon } from './dom';
import { renderMarkdown } from './markdown';

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
    await app.openSettings();
    return;
  }
  if (name === 'pill-busy') {
    // Collapsed chat while the agent works (store screenshot / visual check).
    const screen = (app as unknown as { screenView: { active: Record<string, unknown>; setMode: (t: unknown, m: string) => void; syncPill: () => void } }).screenView;
    screen.setMode(screen.active, 'page');
    screen.active.busy = true;
    screen.active.liveStatus = 'Reading the page';
    screen.syncPill();
    return;
  }
  if (name === 'export') {
    const { fileCard } = await import('./export');
    const log = document.querySelector('.chat-host .chat-log');
    document.querySelector('.screen.browser')?.classList.add('mode-chat');
    const answer = h('div', { class: 'msg assistant' });
    answer.append(renderMarkdown('Exported the first 10 products to **tory-burch-shoes.csv**.\n\n| Product | Price |\n|---|---|\n| Mellow Mules | $275 |\n| Claire Flats | $228 |\n\n```csv\nname,price\nMellow Mules,275\n```'));
    log?.replaceChildren(
      h('div', { class: 'turn' },
        h('div', { class: 'msg user' }, 'Export me the 10 first products of this page in csv'),
        fileCard('tory-burch-shoes.csv', 'name,price,rating\n"Women\'s Mellow Mules",275,4.5\nClaire Ballet Flats,228,4.6\nEleanor Loafers,298,4.4\nMiller Sandals,198,4.3\nGood Luck Trainers,248,4.2'),
        answer),
    );
    return;
  }
  if (name === 'cards') {
    // Render the real question + secret cards (demo only reaches private methods).
    const screen = (app as unknown as { screenView: Record<string, (...args: unknown[]) => unknown> }).screenView;
    const active = (screen as unknown as { active: { log: HTMLElement } }).active;
    const turn = h('div', { class: 'turn' }, h('div', { class: 'msg user' }, 'Log in to GitHub and star the capacitor repo'));
    const anchor = h('div');
    turn.append(anchor);
    active.log.replaceChildren(turn);
    void screen.askCard?.call(screen, active, turn, anchor, { question: 'Which account should I use?', options: ['alex@work.com', 'alex@gmail.com'], allowFreeText: true });
    void screen.secretCard?.call(screen, active, turn, anchor, { name: 'github_password', label: 'GitHub password', reason: 'to sign in', kind: 'password', domain: 'github.com' });
    return;
  }
  if (name === 'link') {
    app.handleDeepLink('autobrowse://run?prompt=Summarize%20the%20top%203%20stories%20in%20bullets&url=https%3A%2F%2Fnews.ycombinator.com');
    return;
  }
  if (name === 'tabs') {
    document.querySelector<HTMLButtonElement>('.tabs-btn')?.click();
    await new Promise((r) => setTimeout(r, 100));
    const grid = document.querySelector('.tab-grid');
    const first = grid?.firstElementChild;
    if (!grid || !first) return;
    const cards: Array<[string, string, string, boolean]> = [
      ['Hacker News', 'Top 3: Rust browser engine hits 1.0…', 'news', false],
      ['27 inch 4K monitor', 'Comparing prices on 3 stores…', 'shop', true],
      ['Cafés near the Louvre', 'Café Kitsuné, Le Nemours, Angelina', 'map', false],
    ];
    grid.replaceChildren(
      ...cards.map(([title, line, kind, busy], i) => {
        const card = first.cloneNode(true) as HTMLElement;
        card.classList.toggle('current', i === 1);
        const preview = card.querySelector('.tab-preview');
        preview?.replaceChildren(kind === 'news' ? mockNews() : kind === 'shop' ? mockShopping() : h('div', { class: 'mock-map' }));
        if (busy) preview?.append(h('span', { class: 'tab-busy' }, h('span', { class: 'spinner' }), 'Working'));
        card.querySelector('.tab-meta strong')!.textContent = title;
        card.querySelector('.tab-meta span')!.textContent = line;
        return card;
      }),
    );
    const head = document.querySelector('.tabs-head h3');
    if (head) head.textContent = '3 tabs';
    return;
  }
  if (name === 'chat' || name === 'shopping') {
    const log = document.querySelector('.chat-host .chat-log');
    const section = document.querySelector('.screen.browser');
    const page = document.querySelector('.page-area');
    const address = document.querySelector<HTMLInputElement>('.address input');
    if (!log || !section || !page || !address) return;
    log.replaceChildren();
    const script =
      name === 'chat'
        ? {
            url: 'news.ycombinator.com',
            user: 'Open Hacker News and summarize the top 3 stories.',
            tools: ['Opening news.ycombinator.com', 'Reading the page'],
            answer:
              'Top 3 on Hacker News right now:\n\n1. **Rust browser engine hits 1.0** — a new open source engine, already passing most web tests.\n2. **Why SQLite runs your phone** — a look at the database inside every app.\n3. **Show HN: zero-class CSS** — style plain HTML with no class names.',
          }
        : {
            url: 'google.com/search',
            user: 'Find the best price for a 27 inch 4K monitor and list the top 3 stores.',
            tools: ['Opening google.com', 'Typing “27 inch 4K monitor”', 'Reading the page'],
            answer: 'Best prices for a 27" 4K monitor:\n\n- **Tech Depot** — $279, free delivery\n- **MegaMart** — $289, pickup today\n- **PixelShop** — $299\n\nTech Depot is the cheapest. Want me to open it?',
          };
    section.classList.add('has-page');
    address.value = script.url;
    page.replaceChildren(name === 'chat' ? mockNews() : mockShopping());
    page.classList.add('demo-page');
    const steps = h(
      'div',
      { class: 'steps' },
      h('button', { class: 'steps-head', type: 'button' }, icon('globe'), h('span', { class: 'steps-title' }, `Browsed · ${script.tools.length} steps`), icon('chevron', 'icon steps-chevron')),
    );
    const answer = h('div', { class: 'msg assistant' });
    answer.append(renderMarkdown(script.answer));
    log.append(h('div', { class: 'turn' }, h('div', { class: 'msg user' }, script.user), steps, answer));
    const input = document.querySelector('textarea');
    if (input) input.placeholder = 'Ask about this page or say what to do…';
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
