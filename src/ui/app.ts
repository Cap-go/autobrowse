import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { completeSignIn } from '../auth/oauth';
import { loadLatestCredentials, signOut } from '../auth/token-store';
import type { OAuthCredentialRecord } from '../auth/types';
import { APP_LINKS, PREF_KEYS } from '../config';
import { parseDeepLink } from '../deeplink';
import { BrowserScreen } from './browser-screen';
import { h, icon } from './dom';
import { friendlyError, openExternal, row, toast } from './helpers';
import { vault } from '../secrets/vault';

export type Screen = 'onboarding' | 'connect' | 'main';

const APP_VERSION = '1.0.0';

const ONBOARDING = [
  {
    art: 'sparkles' as const,
    title: 'Meet your browsing agent',
    body: 'Tell it what you need in plain words. It opens pages, reads them and gets things done for you.',
  },
  {
    art: 'globe' as const,
    title: 'Watch every step',
    body: 'The agent works in a real browser you can see. Take over at any moment, it is your browser.',
  },
  {
    art: 'hand' as const,
    title: 'You stay in control',
    body: 'It asks before anything important like buying, posting or changing an account.',
  },
  {
    art: 'shield' as const,
    title: 'Private by design',
    body: 'Your ChatGPT sign in stays in the device Keychain. No Capgo account, no tracking, no ads.',
  },
];

export class App {
  private root: HTMLElement;
  private screen: Screen = 'onboarding';
  private creds: OAuthCredentialRecord | null = null;
  private screenView = new BrowserScreen({
    creds: () => this.creds,
    openSignIn: () => this.openSignInSheet(),
    openSettings: () => void this.openSettings(),
    openSheet: (title, content) => this.openSheet(title, content),
  });

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(preset?: { creds: OAuthCredentialRecord | null; screen: Screen }): Promise<void> {
    if (preset) {
      this.creds = preset.creds;
      this.screen = preset.screen;
      this.render();
      return;
    }
    this.creds = await loadLatestCredentials();
    if (this.creds) {
      this.screen = 'main';
    } else {
      this.screen = hasOnboarded() ? 'connect' : 'onboarding';
    }
    this.render();
  }

  /** Entry point for autobrowse:// and capgo.app/autobrowse links. */
  handleDeepLink(raw: string): void {
    const link = parseDeepLink(raw);
    if (!link) return;
    markOnboarded();
    this.screenView.handleDeepLink(link);
    if (this.screen !== 'main') this.go('main');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
  }

  private render(): void {
    this.screenView.dispose();
    if (this.screen !== 'main') this.screenView.hidePagesFor(true);
    else this.screenView.hidePagesFor(false);
    this.root.replaceChildren();
    const view =
      this.screen === 'onboarding'
        ? this.renderOnboarding()
        : this.screen === 'connect'
          ? this.renderConnect()
          : this.renderMain();
    view.classList.add('fade-in');
    this.root.append(view);
  }

  // ---------- Onboarding ----------

  private renderOnboarding(startIndex = 0): HTMLElement {
    let index = startIndex;
    const track = h('div', { class: 'slides' });
    const dots = h('div', { class: 'dots', role: 'tablist' });

    ONBOARDING.forEach((slide, i) => {
      track.append(
        h(
          'article',
          { class: 'slide', 'aria-label': `${i + 1} of ${ONBOARDING.length}` },
          h('div', { class: 'slide-art' }, icon(slide.art, 'slide-icon')),
          h('h1', {}, slide.title),
          h('p', { class: 'lede' }, slide.body),
        ),
      );
      dots.append(h('span', { class: 'dot' }));
    });

    const next = h('button', { class: 'primary block', type: 'button' }, 'Continue');
    const skip = h('button', { class: 'ghost', type: 'button' }, 'Skip');

    const update = (): void => {
      track.style.transform = `translateX(${-index * 100}%)`;
      [...dots.children].forEach((d, i) => d.classList.toggle('active', i === index));
      next.textContent = index === ONBOARDING.length - 1 ? 'Get started' : 'Continue';
      skip.style.visibility = index === ONBOARDING.length - 1 ? 'hidden' : 'visible';
    };

    const finish = (): void => {
      markOnboarded();
      this.go('connect');
    };

    next.addEventListener('click', () => {
      if (index < ONBOARDING.length - 1) {
        index += 1;
        update();
      } else {
        finish();
      }
    });
    skip.addEventListener('click', finish);

    // Swipe between slides.
    let startX = 0;
    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0]?.clientX ?? 0;
    }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX;
      if (Math.abs(dx) < 40) return;
      index = Math.min(ONBOARDING.length - 1, Math.max(0, index + (dx < 0 ? 1 : -1)));
      update();
    });

    update();
    return h(
      'section',
      { class: 'screen onboarding' },
      h('div', { class: 'topbar' }, h('span'), skip),
      h('div', { class: 'slides-viewport' }, track),
      h('div', { class: 'onboarding-footer' }, dots, next),
    );
  }

  // ---------- Connect ----------

  private renderConnect(): HTMLElement {
    const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const button = h(
      'button',
      { class: 'primary block', type: 'button' },
      icon('sparkles'),
      h('span', {}, 'Continue with ChatGPT'),
    );
    const guest = h('button', { class: 'secondary block', type: 'button' }, 'Browse without signing in');

    button.addEventListener('click', async () => {
      button.disabled = true;
      status.className = 'status';
      status.textContent = 'Opening ChatGPT sign in…';
      try {
        this.creds = await completeSignIn();
        this.go('main');
      } catch (error) {
        status.className = 'status error';
        status.textContent = friendlyError(error);
        button.disabled = false;
      }
    });

    guest.addEventListener('click', () => this.go('main'));

    return h(
      'section',
      { class: 'screen connect' },
      h(
        'div',
        { class: 'connect-hero' },
        icon('logo', 'app-logo'),
        h('h1', {}, 'Auto Browse'),
        h('p', { class: 'lede' }, 'Sign in with your ChatGPT account. The agent runs on your own ChatGPT plan.'),
      ),
      h(
        'ul',
        { class: 'bullets' },
        bullet('shield', 'Tokens stay in the device Keychain'),
        bullet('hand', 'Asks before important actions'),
        bullet('globe', 'Works on any website'),
      ),
      h(
        'div',
        { class: 'connect-actions' },
        button,
        guest,
        status,
        h(
          'p',
          { class: 'fine' },
          'By continuing you agree to the ',
          link('Terms', APP_LINKS.terms),
          ' and ',
          link('Privacy Policy', APP_LINKS.privacy),
          '. Auto Browse is not affiliated with OpenAI.',
        ),
      ),
    );
  }

  // ---------- Main ----------

  private renderMain(): HTMLElement {
    return this.screenView.render();
  }

  // ---------- Sheets ----------

  private openSheet(title: string, content: HTMLElement): () => void {
    const sheet = h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-grabber' }),
      h(
        'div',
        { class: 'sheet-head' },
        h('h3', {}, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('close')),
      ),
      content,
    );
    const backdrop = h('div', { class: 'backdrop' }, sheet);
    // The native browser sits above the HTML layer; hide it under sheets.
    this.screenView.hidePages();
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      this.screenView.showPages();
      backdrop.classList.add('closing');
      window.setTimeout(() => backdrop.remove(), 200);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    sheet.querySelector('.sheet-head .icon-btn')?.addEventListener('click', close);
    document.body.append(backdrop);
    return close;
  }

  private openSignInSheet(): void {
    const status = h('p', { class: 'status', role: 'status' });
    const btn = h(
      'button',
      { class: 'primary block', type: 'button' },
      icon('sparkles'),
      h('span', {}, 'Continue with ChatGPT'),
    );
    const close = this.openSheet(
      'Sign in to use the agent',
      h(
        'div',
        { class: 'sheet-body' },
        h(
          'p',
          { class: 'lede' },
          'The agent uses your own ChatGPT plan. Your sign in is stored only in this device Keychain.',
        ),
        btn,
        status,
      ),
    );
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.className = 'status';
      status.textContent = 'Opening ChatGPT sign in…';
      try {
        this.creds = await completeSignIn();
        close();
        this.go('main');
      } catch (error) {
        status.className = 'status error';
        status.textContent = friendlyError(error);
        btn.disabled = false;
      }
    });
  }

  async openSettings(): Promise<void> {
    let close: () => void = () => undefined;
    const rows = h('div', { class: 'list' });

    rows.append(
      h(
        'div',
        { class: 'account-card' },
        h('div', { class: 'avatar' }, (this.creds?.email ?? '?').slice(0, 1).toUpperCase()),
        h(
          'div',
          {},
          h('strong', {}, this.creds ? this.creds.email : 'Not signed in'),
          h('span', {}, this.creds ? 'ChatGPT account' : 'Browsing as guest'),
        ),
      ),
    );

    const group = (label: string, ...items: HTMLElement[]): HTMLElement =>
      h('div', { class: 'group' }, h('p', { class: 'section-label' }, label), h('div', { class: 'rows' }, ...items));

    rows.append(
      group(
        'About',
        row('Privacy Policy', 'external', () => void openExternal(APP_LINKS.privacy)),
        row('Terms of Use', 'external', () => void openExternal(APP_LINKS.terms)),
        row('Help & Support', 'external', () => void openExternal(APP_LINKS.support)),
        row('Replay introduction', 'chevron', () => {
          close();
          this.go('onboarding');
        }),
      ),
    );

    await vault.load();
    const secrets = vault.list().filter((secret) => secret.remembered);
    const secretRows = secrets.map((secret) => {
      const r = row(`${secret.label} · ${secret.domain}`, 'trash', async () => {
        await vault.remove(secret.name, secret.domain);
        r.remove();
        toast(`Deleted ${secret.label}`);
      });
      return r;
    });
    rows.append(
      group(
        'Passwords & secrets',
        ...(secretRows.length
          ? secretRows
          : [h('p', { class: 'row muted-row' }, 'None saved. The agent asks for them in a secure card when a site needs one.')]),
      ),
    );

    rows.append(
      group(
        'Data',
        row('Close all tabs and clear browsing data', 'trash', async () => {
          await this.screenView.reset();
          await InAppBrowser.clearAllCookies().catch(() => undefined);
          await InAppBrowser.clearCache().catch(() => undefined);
          close();
          this.render();
        }),
      ),
    );

    if (this.creds) {
      const out = row('Sign out', 'logout', async () => {
        await this.screenView.reset();
        await signOut();
        this.creds = null;
        close();
        this.go('connect');
      });
      out.classList.add('danger');
      rows.append(group('Account', out));
    } else {
      rows.append(
        group(
          'Account',
          row('Sign in with ChatGPT', 'sparkles', () => {
            close();
            this.openSignInSheet();
          }),
        ),
      );
    }

    rows.append(h('p', { class: 'fine center' }, `Auto Browse ${APP_VERSION} · Not affiliated with OpenAI`));
    close = this.openSheet('Settings', h('div', { class: 'sheet-body' }, rows));
  }
}

// ---------- helpers ----------

function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(PREF_KEYS.onboarded) === '1';
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(PREF_KEYS.onboarded, '1');
  } catch {
    /* private mode */
  }
}

function bullet(name: Parameters<typeof icon>[0], text: string): HTMLElement {
  return h('li', {}, h('span', { class: 'bullet-icon' }, icon(name)), h('span', {}, text));
}

function link(label: string, url: string): HTMLElement {
  return h(
    'a',
    {
      href: url,
      onclick: (e: Event) => {
        e.preventDefault();
        void openExternal(url);
      },
    },
    label,
  );
}

