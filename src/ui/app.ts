import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { completeSignIn } from '../auth/oauth';
import { loadLatestCredentials } from '../auth/token-store';
import { currentCredentials, endSession, setCredentials } from '../auth/session';
import type { OAuthCredentialRecord } from '../auth/types';
import { APP_LINKS, PREF_KEYS } from '../config';
import { parseDeepLink } from '../deeplink';
import { hasAiConsent, requestAiConsent, setAiConsent } from './ai-consent';
import { BrowserScreen } from './browser-screen';
import { h, icon } from './dom';
import { friendlyError, openExternal, row, toast } from './helpers';
import { vault } from '../secrets/vault';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

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
    body: 'Your sign in stays in secure device storage. Nothing goes to OpenAI until you allow it. No tracking, no ads.',
  },
];

export class App {
  private root: HTMLElement;
  private screen: Screen = 'onboarding';
  private sheets: Array<() => void> = [];
  private screenView = new BrowserScreen({
    creds: () => this.creds,
    openSignIn: () => this.openSignInSheet(),
    openSettings: () => void this.openSettings(),
    openSheet: (title, content) => this.openSheet(title, content),
    requestAiConsent: () => requestAiConsent((title, content, onClose) => this.openSheet(title, content, onClose)),
  });

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** The signed-in account, always the latest refreshed record (see auth/session). */
  private get creds(): OAuthCredentialRecord | null {
    return currentCredentials();
  }

  async init(preset?: { creds: OAuthCredentialRecord | null; screen: Screen }): Promise<void> {
    if (preset) {
      setCredentials(preset.creds);
      this.screen = preset.screen;
      this.render();
      return;
    }
    setCredentials(await loadLatestCredentials().catch(() => null));
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

  async handleBack(): Promise<boolean> {
    const close = this.sheets.at(-1);
    if (close) {
      close();
      return true;
    }
    return this.screen === 'main' && await this.screenView.handleBack();
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
      // Replaying the introduction while signed in goes back to the browser.
      this.go(this.creds ? 'main' : 'connect');
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

    // Swipe between slides. Listen on the fixed viewport (not the moving
    // track) so every slide responds, and let the slide follow the finger.
    const viewport = h('div', { class: 'slides-viewport' }, track);
    let startX = 0;
    let startY = 0;
    let dragging = false;
    viewport.addEventListener('touchstart', (e) => {
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
      dragging = false;
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      const dx = (e.touches[0]?.clientX ?? 0) - startX;
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        track.style.transition = 'none';
      }
      if (!dragging) return;
      e.preventDefault();
      // Resist at the ends.
      const atEdge = (index === 0 && dx > 0) || (index === ONBOARDING.length - 1 && dx < 0);
      track.style.transform = `translateX(calc(${-index * 100}% + ${atEdge ? dx / 3 : dx}px))`;
    }, { passive: false });
    const endSwipe = (e: TouchEvent): void => {
      track.style.transition = '';
      if (!dragging) return;
      dragging = false;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX;
      if (Math.abs(dx) > 50) {
        index = Math.min(ONBOARDING.length - 1, Math.max(0, index + (dx < 0 ? 1 : -1)));
      }
      update();
    };
    viewport.addEventListener('touchend', endSwipe);
    viewport.addEventListener('touchcancel', endSwipe);

    update();
    return h(
      'section',
      { class: 'screen onboarding' },
      h('div', { class: 'topbar' }, h('span'), skip),
      viewport,
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
      status.textContent = '';
      if (!(await this.consentBeforeSignIn(status))) {
        button.disabled = false;
        return;
      }
      status.textContent = 'Opening ChatGPT sign in…';
      try {
        setCredentials(await completeSignIn());
        this.go('main');
        this.afterSignIn();
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
        bullet('shield', 'Tokens stay in secure device storage'),
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

  private openSheet(title: string, content: HTMLElement, onClose?: () => void): () => void {
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
      onClose?.();
      this.sheets = this.sheets.filter((fn) => fn !== close);
      this.screenView.showPages();
      backdrop.classList.add('closing');
      window.setTimeout(() => backdrop.remove(), 200);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    sheet.querySelector('.sheet-head .icon-btn')?.addEventListener('click', close);
    bindSheetDrag(sheet, backdrop, close);
    document.body.append(backdrop);
    this.sheets.push(close);
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
          'The agent uses your own ChatGPT plan. Your sign in is stored only in secure device storage.',
        ),
        btn,
        status,
      ),
    );
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.className = 'status';
      status.textContent = '';
      if (!(await this.consentBeforeSignIn(status))) {
        btn.disabled = false;
        return;
      }
      status.textContent = 'Opening ChatGPT sign in…';
      try {
        setCredentials(await completeSignIn());
        close();
        this.go('main');
        this.afterSignIn();
      } catch (error) {
        status.className = 'status error';
        status.textContent = friendlyError(error);
        btn.disabled = false;
      }
    });
  }

  /**
   * Signing in only exists to let OpenAI run the agent, so the data sharing
   * screen comes first (guideline 5.1.2(i)). Declining keeps guest browsing.
   */
  private async consentBeforeSignIn(status: HTMLElement): Promise<boolean> {
    const allowed = await requestAiConsent((title, content, onClose) => this.openSheet(title, content, onClose));
    if (!allowed) {
      status.className = 'status';
      status.textContent = 'The agent needs your OK to share data with OpenAI. You can still browse without signing in.';
    }
    return allowed;
  }

  /** Right after sign in: send the task the user already chose. */
  private afterSignIn(): void {
    this.screenView.resumeAfterSignIn();
  }

  /** Sign out removes everything tied to this person, so the next user starts clean. */
  private confirmSignOut(): void {
    const confirm = h('button', { class: 'primary block danger', type: 'button' }, 'Sign out');
    const cancel = h('button', { class: 'secondary block', type: 'button' }, 'Cancel');
    const close = this.openSheet(
      'Sign out?',
      h(
        'div',
        { class: 'sheet-body' },
        h(
          'p',
          { class: 'lede' },
          'This closes all tabs and removes your ChatGPT sign in, website logins, saved passwords and your data sharing choice from this device.',
        ),
        confirm,
        cancel,
      ),
    );
    cancel.addEventListener('click', close);
    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      this.screenView.stopAll();
      await this.screenView.reset();
      await endSession();
      await vault.clear().catch(() => undefined);
      await clearBrowsingData();
      setAiConsent(false);
      close();
      this.go('connect');
      toast('Signed out. Website logins and saved passwords were removed.');
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

    const consentRow = (): HTMLElement => {
      const allowed = hasAiConsent();
      const r = row(`Share data with OpenAI: ${allowed ? 'On' : 'Off'}`, 'chevron', async () => {
        if (hasAiConsent()) {
          setAiConsent(false);
          // Running agents stop now: nothing more is sent.
          const stopped = this.screenView.stopAll();
          toast(
            stopped
              ? `Data sharing with OpenAI is off. Stopped ${stopped} running ${stopped === 1 ? 'task' : 'tasks'}.`
              : 'Data sharing with OpenAI is off. The agent will ask again before the next task.',
          );
        } else {
          await requestAiConsent((title, content, onClose) => this.openSheet(title, content, onClose));
        }
        r.replaceWith(consentRow());
      });
      return r;
    };
    rows.append(group('AI data sharing', consentRow()));

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
          await clearBrowsingData();
          close();
          this.render();
          toast('Tabs closed and browsing data cleared.');
        }),
      ),
    );

    if (this.creds) {
      const out = row('Sign out', 'logout', () => {
        close();
        this.confirmSignOut();
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

    // About footer: app icon, versions, maker, and the "By Capgo" pill.
    const maker = h('a', { href: APP_LINKS.makerX, class: 'about-link' }, 'Martin Donadieu');
    maker.addEventListener('click', (e) => {
      e.preventDefault();
      void openExternal(APP_LINKS.makerX);
    });
    const capgo = h(
      'button',
      { class: 'capgo-pill', type: 'button', 'aria-label': 'By Capgo, open capgo.app' },
      icon('capgo', 'capgo-logo'),
      h('span', {}, 'By Capgo'),
    );
    capgo.addEventListener('click', () => void openExternal(APP_LINKS.capgo));
    rows.append(
      h(
        'div',
        { class: 'about' },
        h('img', { class: 'about-icon', src: '/app-icon.png', alt: 'Auto Browse' }),
        h('p', { class: 'about-version' }, await versionLine()),
        h('p', { class: 'about-maker' }, 'Made by ', maker),
        h('p', { class: 'about-note' }, 'Not affiliated with OpenAI.'),
        capgo,
      ),
    );
    close = this.openSheet('Settings', h('div', { class: 'sheet-body' }, rows));
  }
}

// ---------- helpers ----------

/** Cookies, cache and site storage (localStorage, IndexedDB) of every page. */
async function clearBrowsingData(): Promise<void> {
  await InAppBrowser.clearAllBrowsingData().catch(() => undefined);
  await InAppBrowser.clearAllCookies().catch(() => undefined);
  await InAppBrowser.clearCache().catch(() => undefined);
}

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


/** "Version 1.0.0 · 1.0.2": native app version, then the live Capgo bundle when one is active. */
async function versionLine(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return `Version ${APP_VERSION}`;
  try {
    const info = await CapacitorUpdater.current();
    return info.bundle.id === 'builtin' ? `Version ${info.native}` : `Version ${info.native} · ${info.bundle.version}`;
  } catch {
    return `Version ${APP_VERSION}`;
  }
}

/**
 * Drag a sheet down to dismiss it, like iOS sheets. Drags start on the grabber
 * or header, or on the content when it is scrolled to the top. Past a quarter
 * of the height (or a quick flick) it closes; otherwise it springs back.
 */
function bindSheetDrag(sheet: HTMLElement, backdrop: HTMLElement, close: () => void): void {
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let pending = false;

  const begin = (y: number): void => {
    startY = y;
    lastY = y;
    lastT = performance.now();
    velocity = 0;
    pending = true;
  };
  const move = (y: number, e: TouchEvent): void => {
    if (!pending && !dragging) return;
    const dy = y - startY;
    if (pending) {
      // Only take over for a downward drag; let content scroll otherwise.
      if (dy < 6) return;
      pending = false;
      dragging = true;
      sheet.style.transition = 'none';
      backdrop.style.transition = 'none';
    }
    e.preventDefault();
    const now = performance.now();
    velocity = (y - lastY) / Math.max(1, now - lastT);
    lastY = y;
    lastT = now;
    const offset = Math.max(0, dy);
    sheet.style.transform = `translateY(${offset}px)`;
    backdrop.style.backgroundColor = `rgba(0, 0, 0, ${0.5 * Math.max(0, 1 - offset / sheet.offsetHeight)})`;
  };
  const end = (): void => {
    pending = false;
    if (!dragging) return;
    dragging = false;
    const offset = Math.max(0, lastY - startY);
    sheet.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
    backdrop.style.transition = 'background-color 0.25s ease';
    if (offset > sheet.offsetHeight * 0.25 || velocity > 0.6) {
      sheet.style.transform = 'translateY(100%)';
      backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0)';
      close();
    } else {
      sheet.style.transform = '';
      backdrop.style.backgroundColor = '';
    }
  };

  sheet.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as HTMLElement;
      const onHandle = !!target.closest('.sheet-grabber, .sheet-head');
      const interactive = !!target.closest('input, textarea, select');
      if (interactive) return;
      if (onHandle || sheet.scrollTop <= 0) begin(e.touches[0]?.clientY ?? 0);
    },
    { passive: true },
  );
  sheet.addEventListener('touchmove', (e) => move(e.touches[0]?.clientY ?? 0, e), { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
