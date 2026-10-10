import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { completeSignIn } from '../auth/oauth';
import { loadLatestCredentials, signOut } from '../auth/token-store';
import type { OAuthCredentialRecord } from '../auth/types';
import {
  appendUserMessage,
  createInitialState,
  runAgentTurn,
  type AgentLoopState,
} from '../agent/loop';
import { closeBrowser, openBrowser } from '../browser/browser-controller';
import { APP_LINKS, PREF_KEYS } from '../config';
import { h, icon } from './dom';

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

const SUGGESTIONS = [
  { title: 'Compare prices', prompt: 'Find the best price for a 27 inch 4K monitor and list the top 3 stores.' },
  { title: 'Summarize news', prompt: 'Open Hacker News and summarize the top 5 stories.' },
  { title: 'Plan a trip', prompt: 'Find 3 well rated cafés near the Louvre in Paris.' },
  { title: 'Read for me', prompt: 'Open wikipedia.org and explain what Capacitor JS is in 3 bullets.' },
];

const QUICK_SITES = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
];

export class App {
  private root: HTMLElement;
  private screen: Screen = 'onboarding';
  private creds: OAuthCredentialRecord | null = null;
  private agentState: AgentLoopState | null = null;
  private busy = false;

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

  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
  }

  private render(): void {
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
        h('h1', {}, 'Capgo Browser'),
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
          '. Capgo Browser is not affiliated with OpenAI.',
        ),
      ),
    );
  }

  // ---------- Main ----------

  private renderMain(): HTMLElement {
    const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const input = h('textarea', {
      rows: 1,
      placeholder: this.creds ? 'Ask the agent to browse…' : 'Sign in to use the agent',
      'aria-label': 'Message',
      enterkeyhint: 'send',
    });
    const send = h('button', { class: 'send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
    const form = h('form', { class: 'composer' }, input, send);

    const empty = this.renderEmptyState((prompt) => {
      input.value = prompt;
      autoGrow(input);
      form.requestSubmit();
    });
    log.append(empty);

    const syncSend = (): void => {
      send.disabled = this.busy || !input.value.trim();
    };
    input.addEventListener('input', () => {
      autoGrow(input);
      syncSend();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    syncSend();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || this.busy) return;
      if (!this.creds) {
        this.openSignInSheet();
        return;
      }
      empty.remove();
      input.value = '';
      autoGrow(input);
      this.busy = true;
      syncSend();

      log.append(bubble('user', text));
      const thinking = h('div', { class: 'typing' }, h('span'), h('span'), h('span'));
      let pending: HTMLElement | null = null;
      const activity = h('div', { class: 'activity' });
      log.append(activity, thinking);
      scrollToEnd(log);

      const ensureBubble = (): HTMLElement => {
        if (!pending) {
          pending = bubble('assistant', '');
          log.insertBefore(pending, thinking);
        }
        return pending;
      };

      try {
        const state = this.agentState
          ? appendUserMessage(this.agentState, text)
          : createInitialState(text);
        const result = await runAgentTurn(this.creds, state, {
          onAssistantDelta: (delta) => {
            ensureBubble().textContent += delta;
            scrollToEnd(log);
          },
          onToolStart: (name, args) => {
            activity.append(toolChip(name, args));
            scrollToEnd(log);
          },
          onToolEnd: (_name, ok) => {
            const chip = activity.lastElementChild;
            chip?.classList.add(ok ? 'done' : 'failed');
          },
        });
        this.agentState = result.state;
        if (!pending || !(pending as HTMLElement).textContent) {
          ensureBubble().textContent = result.assistantText || 'Done.';
        }
      } catch (error) {
        const err = bubble('assistant', friendlyError(error));
        err.classList.add('error');
        log.insertBefore(err, thinking);
      } finally {
        thinking.remove();
        if (!activity.childElementCount) activity.remove();
        this.busy = false;
        syncSend();
        scrollToEnd(log);
      }
    });

    const header = h(
      'header',
      { class: 'appbar' },
      h('div', { class: 'appbar-title' }, icon('logo', 'mini-logo'), h('span', {}, 'Capgo Browser')),
      h(
        'div',
        { class: 'appbar-actions' },
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'New chat',
            onclick: () => {
              this.agentState = null;
              this.render();
            },
          },
          icon('plus'),
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Open browser',
            onclick: () => void openBrowser('https://www.google.com'),
          },
          icon('globe'),
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Settings',
            onclick: () => this.openSettings(),
          },
          icon('settings'),
        ),
      ),
    );

    const footer = h('footer', { class: 'composer-wrap' }, form);
    if (!this.creds) {
      footer.prepend(
        h(
          'button',
          { class: 'signin-banner', type: 'button', onclick: () => this.openSignInSheet() },
          icon('sparkles'),
          h('span', {}, 'Sign in with ChatGPT to let the agent browse for you'),
          icon('chevron'),
        ),
      );
    }

    return h('section', { class: 'screen main' }, header, log, footer);
  }

  private renderEmptyState(onPick: (prompt: string) => void): HTMLElement {
    const urlInput = h('input', {
      type: 'url',
      inputmode: 'url',
      placeholder: 'Search or enter website',
      'aria-label': 'Website address',
      autocapitalize: 'off',
      autocorrect: 'off',
      enterkeyhint: 'go',
    });
    const urlForm = h('form', { class: 'url-bar' }, icon('globe'), urlInput);
    urlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = toUrl(urlInput.value);
      if (url) void openBrowser(url);
    });

    return h(
      'div',
      { class: 'empty' },
      h(
        'div',
        { class: 'empty-hero' },
        h('h2', {}, this.creds ? `What should I do${firstName(this.creds.email)}?` : 'Where to?'),
        h(
          'p',
          { class: 'lede' },
          this.creds
            ? 'I open websites, read them and act for you. You can watch and take over anytime.'
            : 'Open any website, or sign in with ChatGPT to let the agent do the browsing.',
        ),
      ),
      urlForm,
      h(
        'div',
        { class: 'quick-sites' },
        ...QUICK_SITES.map((site) =>
          h('button', { class: 'chip', type: 'button', onclick: () => void openBrowser(site.url) }, site.label),
        ),
      ),
      h('p', { class: 'section-label' }, 'Try asking'),
      h(
        'div',
        { class: 'suggestions' },
        ...SUGGESTIONS.map((s) =>
          h(
            'button',
            { class: 'suggestion', type: 'button', onclick: () => onPick(s.prompt) },
            h('strong', {}, s.title),
            h('span', {}, s.prompt),
          ),
        ),
      ),
    );
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
    const close = (): void => {
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

  openSettings(): void {
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

    rows.append(
      group(
        'Data',
        row('Close browser and clear session', 'trash', async () => {
          await closeBrowser().catch(() => undefined);
          await InAppBrowser.clearAllCookies().catch(() => undefined);
          await InAppBrowser.clearCache().catch(() => undefined);
          this.agentState = null;
          close();
          this.render();
        }),
      ),
    );

    if (this.creds) {
      const out = row('Sign out', 'logout', async () => {
        await signOut();
        this.creds = null;
        this.agentState = null;
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

    rows.append(h('p', { class: 'fine center' }, `Capgo Browser ${APP_VERSION} · Not affiliated with OpenAI`));
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

function row(label: string, trailing: Parameters<typeof icon>[0], onTap: () => void | Promise<void>): HTMLElement {
  return h(
    'button',
    { class: 'row', type: 'button', onclick: () => void onTap() },
    h('span', {}, label),
    icon(trailing),
  );
}

function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
  return h('div', { class: `bubble ${role}` }, text);
}

const TOOL_LABELS: Record<string, string> = {
  browser_navigate: 'Opening',
  browser_screenshot: 'Looking at the page',
  browser_click: 'Clicking',
  browser_type: 'Typing',
  browser_scroll: 'Scrolling',
  browser_read_dom: 'Reading the page',
  browser_extract: 'Extracting details',
};

function toolChip(name: string, args?: Record<string, unknown>): HTMLElement {
  let label = TOOL_LABELS[name] ?? name;
  if (name === 'browser_navigate' && typeof args?.url === 'string') {
    try {
      label = `${label} ${new URL(args.url).hostname.replace(/^www\./, '')}`;
    } catch {
      /* keep label */
    }
  }
  return h('div', { class: 'tool-chip' }, h('span', { class: 'spinner' }), icon('check', 'icon ok'), h('span', {}, label));
}

function scrollToEnd(el: HTMLElement): void {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

function firstName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const name = local.split(/[._-]/)[0] ?? '';
  if (!name || /\d/.test(name)) return '';
  return `, ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function toUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

async function openExternal(url: string): Promise<void> {
  try {
    await InAppBrowser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/usage limit/i.test(message)) {
    return 'You reached your ChatGPT plan usage limit. Try again later.';
  }
  if (/cancel/i.test(message)) {
    return 'Sign in was cancelled.';
  }
  if (/network|fetch|offline/i.test(message)) {
    return 'No connection. Check your internet and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}
