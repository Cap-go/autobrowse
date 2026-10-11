import type { OAuthCredentialRecord } from '../auth/types';
import { appendUserMessage, createInitialState, runAgentTurn, type AgentLoopState } from '../agent/loop';
import { AppLauncher } from '@capacitor/app-launcher';
import { BrowserTab, onExternalLink } from '../browser/browser-controller';
import { isAppActive, onAppActiveChange } from '../agent/lifecycle';
import type { DeepLinkAction } from '../deeplink';
import type { AskUserRequest, AskUserResult, SecretRequest, SecretRequestResult } from '../agent/types';
import { vault } from '../secrets/vault';
import { h, icon } from './dom';
import {
  autoGrow,
  firstName,
  friendlyError,
  prettyUrl,
  row,
  scrollToEnd,
  toast,
  toolLabel,
  toUrl,
} from './helpers';
import { renderMarkdown } from './markdown';
import { VoiceInput } from './voice';

export interface BrowserScreenHost {
  creds(): OAuthCredentialRecord | null;
  openSignIn(): void;
  openSettings(): void;
  openSheet(title: string, content: HTMLElement): () => void;
}

/** split: page above chat · chat: page hidden · page: chat folded to the composer */
type Mode = 'split' | 'chat' | 'page';

interface Tab {
  id: number;
  browser: BrowserTab;
  agentState: AgentLoopState | null;
  log: HTMLElement;
  busy: boolean;
  stopRequested: boolean;
  /** Resolves a question/secret card that is waiting when the user taps Stop. */
  cancelPending?: () => void;
  mode: Mode;
  /** Share of the free height given to the page in split mode. */
  pageShare: number;
  thumb?: string;
  lastText: string;
  /** URL to open once the tab is on screen (links that arrive before render). */
  pendingUrl?: string;
}

const SUGGESTIONS = [
  { title: 'Compare prices', prompt: 'Find the best price for a 27 inch 4K monitor and list the top 3 stores.' },
  { title: 'Summarize news', prompt: 'Open Hacker News and summarize the top 5 stories.' },
  { title: 'Plan a trip', prompt: 'Find 3 well rated cafés near the Louvre in Paris.' },
  { title: 'Read for me', prompt: 'Open wikipedia.org and explain what Capacitor JS is in 3 bullets.' },
];

const QUICK_SITES = [
  { label: 'Google', url: 'https://www.google.com', color: '#4285f4' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#636466' },
  { label: 'YouTube', url: 'https://m.youtube.com', color: '#ff0033' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com', color: '#ff6600' },
  { label: 'Amazon', url: 'https://www.amazon.com', color: '#ff9900' },
  { label: 'Reddit', url: 'https://www.reddit.com', color: '#ff4500' },
  { label: 'GitHub', url: 'https://github.com', color: '#6e7681' },
  { label: 'Maps', url: 'https://maps.google.com', color: '#34a853' },
];

const SNAP_EDGE = 0.14;

export class BrowserScreen {
  private tabs: Tab[] = [];
  private active!: Tab;
  private nextId = 1;
  private overlayOpen = false;
  private sheetsOpen = 0;
  private offscreen = false;
  private cleanups: Array<() => void> = [];

  // Elements of the current render.
  private section!: HTMLElement;
  private pageArea!: HTMLElement;
  private chatHost!: HTMLElement;
  private address!: HTMLInputElement;
  private backBtn!: HTMLButtonElement;
  private reloadBtn!: HTMLButtonElement;
  private tabsBtn!: HTMLButtonElement;
  private progress!: HTMLElement;
  private status!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private send!: HTMLButtonElement;
  private showPagePill!: HTMLButtonElement;
  private showChatPill!: HTMLButtonElement;

  constructor(private host: BrowserScreenHost) {
    this.active = this.createTab();
    onExternalLink((tab, url) => this.confirmExternal(tab, url));
  }

  private externalPrompt = false;

  /** A page wants to open another app (mailto:, tel:, youtube://…): ask first. */
  private confirmExternal(tab: BrowserTab, url: string): void {
    const owner = this.tabs.find((t) => t.browser === tab);
    // Only the visible tab may prompt; background tabs and agents never leave the app.
    if (!owner || owner !== this.active || this.externalPrompt || this.overlayOpen) return;
    this.externalPrompt = true;
    const target = describeExternal(url);
    const site = tab.url ? prettyUrl(tab.url).split('/')[0] : 'This page';
    let close: () => void = () => undefined;
    const open = h('button', { class: 'primary block', type: 'button' }, `Open ${target.app}`);
    const stay = h('button', { class: 'secondary block', type: 'button' }, 'Stay in Auto Browse');
    open.addEventListener('click', () => {
      close();
      void AppLauncher.openUrl({ url }).catch(() => toast(`Could not open ${target.app}.`));
    });
    stay.addEventListener('click', () => close());
    const body = h(
      'div',
      { class: 'sheet-body' },
      h('p', { class: 'lede' }, `${site} wants to open ${target.app}${target.detail ? `: ${target.detail}` : ''}.`),
      h('p', { class: 'fine external-url' }, url.length > 120 ? `${url.slice(0, 117)}…` : url),
      open,
      stay,
    );
    const closeSheet = this.host.openSheet('Leave Auto Browse?', body);
    close = () => {
      this.externalPrompt = false;
      closeSheet();
    };
  }

  // ---------- public API ----------

  render(): HTMLElement {
    this.dispose();
    const section = h('section', { class: 'screen browser' });
    this.section = section;

    // Address bar
    this.backBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back' }, icon('back'));
    this.backBtn.addEventListener('click', () => void this.active.browser.goBack().catch(() => undefined));
    this.address = h('input', {
      type: 'text',
      inputmode: 'url',
      placeholder: 'Search or enter website',
      'aria-label': 'Address',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
    });
    this.reloadBtn = h('button', { class: 'addr-action', type: 'button', 'aria-label': 'Reload' }, icon('reload'));
    this.reloadBtn.addEventListener('click', () => void this.active.browser.reload().catch(() => undefined));
    const addressForm = h('form', { class: 'address' }, icon('search', 'icon addr-icon'), this.address, this.reloadBtn);
    addressForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = toUrl(this.address.value);
      this.address.blur();
      if (url) this.openUrl(this.active, url);
    });
    this.address.addEventListener('focus', () => {
      this.address.value = this.active.browser.url ?? '';
      this.address.select();
      section.classList.add('editing');
    });
    this.address.addEventListener('blur', () => {
      section.classList.remove('editing');
      this.syncChrome();
    });

    this.tabsBtn = h('button', { class: 'tabs-btn', type: 'button', 'aria-label': 'Tabs' });
    this.tabsBtn.addEventListener('click', () => void this.openTabSwitcher());
    const menuBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Menu' }, icon('more'));
    menuBtn.addEventListener('click', () => this.openMenu());

    const bar = h('header', { class: 'addressbar' }, this.backBtn, addressForm, this.tabsBtn, menuBtn);
    this.progress = h('div', { class: 'progress' });

    // Page area: the native webview of the active tab is framed over it.
    this.pageArea = h('div', { class: 'page-area' });

    // Divider: drag to resize, snaps to "chat only" / "page only" at the edges.
    this.status = h('span', { class: 'agent-status' });
    const divider = h(
      'div',
      { class: 'divider', role: 'separator', 'aria-label': 'Resize page and chat' },
      h('span', { class: 'grabber' }),
      this.status,
    );
    this.bindDivider(divider);

    // Chat
    this.chatHost = h('div', { class: 'chat-host' });
    // Like ChatGPT: scrolling the conversation closes the keyboard.
    this.chatHost.addEventListener('touchmove', () => this.input.blur(), { passive: true });
    this.showPagePill = h('button', { class: 'pill', type: 'button' }, icon('globe'), h('span', {}, 'Show page'));
    this.showPagePill.addEventListener('click', () => this.setMode(this.active, 'split'));
    this.showChatPill = h('button', { class: 'pill', type: 'button' }, icon('chat'), h('span', {}, 'Show chat'));
    this.showChatPill.addEventListener('click', () => this.setMode(this.active, 'split'));

    this.input = h('textarea', { rows: 1, 'aria-label': 'Message', enterkeyhint: 'send' });
    this.send = h('button', { class: 'send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
    const mic = h('button', { class: 'mic', type: 'button', 'aria-label': 'Speak' }, icon('mic'));
    const form = h('form', { class: 'composer' }, this.input);
    if (VoiceInput.supported()) form.append(mic);
    form.append(this.send);
    this.bindComposer(form, mic);

    const chat = h(
      'div',
      { class: 'chat-area' },
      h('div', { class: 'pills' }, this.showPagePill, this.showChatPill),
      this.chatHost,
      h('footer', { class: 'composer-wrap' }, form),
    );

    section.append(bar, this.progress, this.pageArea, divider, chat);

    const observer = new ResizeObserver(() => this.syncFrame());
    observer.observe(this.pageArea);
    this.cleanups.push(() => observer.disconnect());
    const onResize = (): void => this.syncFrame();
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    this.showTab(this.active);
    return section;
  }

  dispose(): void {
    this.cleanups.splice(0).forEach((fn) => fn());
  }

  /** Hide every native page (sheets, other screens). Counted so nested sheets work. */
  hidePages(): void {
    this.sheetsOpen += 1;
    for (const tab of this.tabs) void tab.browser.setVisible(false);
  }

  showPages(): void {
    this.sheetsOpen = Math.max(0, this.sheetsOpen - 1);
    this.syncVisibility();
  }

  /** Hide pages while another screen (onboarding, sign in) is shown. */
  hidePagesFor(offscreen: boolean): void {
    this.offscreen = offscreen;
    this.syncVisibility();
  }

  /** Close every tab (sign out, clear data) and start fresh. */
  async reset(): Promise<void> {
    for (const tab of this.tabs) {
      tab.stopRequested = true;
      tab.cancelPending?.();
      await tab.browser.close();
    }
    this.tabs = [];
    this.active = this.createTab();
  }

  /**
   * Handle an autobrowse:// or capgo.app/autobrowse link: open a tab, load the
   * page and offer the task with a one-tap Start card. Links never run on
   * their own because the agent acts in the user's logged-in sessions.
   */
  handleDeepLink(link: DeepLinkAction): void {
    const current = this.active;
    const blank = !current.browser.url && !current.agentState && !current.busy;
    const tab = link.tab === 'current' || blank ? current : this.createTab();
    if (tab !== this.active && this.section) this.showTab(tab);
    else if (tab !== this.active) this.active = tab;
    if (link.url) this.openUrl(tab, link.url);
    if (link.action === 'run' && link.prompt) {
      tab.log.querySelector('.welcome')?.remove();
      tab.log.querySelector('.link-card')?.remove();
      tab.log.append(this.renderLinkCard(tab, link.prompt, link.url));
      scrollToEnd(tab.log);
    }
  }

  private renderLinkCard(tab: Tab, prompt: string, url?: string): HTMLElement {
    const card = h(
      'div',
      { class: 'link-card' },
      h('p', { class: 'link-card-label' }, icon('sparkles'), h('span', {}, 'A link wants to start this task')),
      h('p', { class: 'link-card-prompt' }, prompt),
      url ? h('p', { class: 'link-card-url' }, icon('globe'), h('span', {}, prettyUrl(url))) : null,
    );
    const start = h('button', { class: 'primary', type: 'button' }, 'Start');
    const edit = h('button', { class: 'secondary', type: 'button' }, 'Edit');
    const dismiss = h('button', { class: 'ghost', type: 'button' }, 'Dismiss');
    start.addEventListener('click', () => {
      if (!this.host.creds()) {
        this.host.openSignIn();
        return;
      }
      card.remove();
      if (tab !== this.active) this.showTab(tab);
      this.submit(prompt);
    });
    edit.addEventListener('click', () => {
      card.remove();
      if (tab !== this.active) this.showTab(tab);
      this.input.value = prompt;
      autoGrow(this.input);
      this.syncComposer();
      this.input.focus();
    });
    dismiss.addEventListener('click', () => card.remove());
    card.append(h('div', { class: 'link-card-actions' }, start, edit, dismiss));
    return card;
  }

  get runningCount(): number {
    return this.tabs.filter((t) => t.busy).length;
  }

  // ---------- tabs ----------

  private createTab(): Tab {
    const tab: Tab = {
      id: this.nextId++,
      browser: new BrowserTab(),
      agentState: null,
      log: h('div', { class: 'chat-log', 'aria-live': 'polite' }),
      busy: false,
      stopRequested: false,
      mode: 'split',
      pageShare: 0.55,
      lastText: '',
    };
    tab.browser.onChange(() => {
      if (tab === this.active) this.syncChrome();
      this.syncTabsButton();
    });
    this.tabs.push(tab);
    return tab;
  }

  private newTab(): void {
    const tab = this.createTab();
    this.showTab(tab);
  }

  private async closeTab(tab: Tab): Promise<void> {
    tab.stopRequested = true;
    tab.cancelPending?.();
    await tab.browser.close();
    this.tabs = this.tabs.filter((t) => t !== tab);
    if (!this.tabs.length) this.createTab();
    if (tab === this.active) this.showTab(this.tabs[this.tabs.length - 1]!);
    else this.syncTabsButton();
  }

  private showTab(tab: Tab): void {
    this.active = tab;
    this.chatHost.replaceChildren(tab.log);
    if (!tab.log.childElementCount) tab.log.append(this.renderWelcome());
    this.renderStartPage();
    this.applyMode();
    this.syncChrome();
    this.syncComposer();
    this.syncTabsButton();
    this.syncVisibility();
    if (!tab.log.querySelector('.welcome')) scrollToEnd(tab.log);
    if (tab.pendingUrl) {
      const url = tab.pendingUrl;
      tab.pendingUrl = undefined;
      // Wait until the section is attached so the page gets its frame.
      requestAnimationFrame(() => this.openUrl(tab, url));
    }
  }

  private openUrl(tab: Tab, url: string): void {
    if (!this.section?.isConnected || tab !== this.active) {
      tab.pendingUrl = url;
      return;
    }
    if (tab.mode === 'chat') this.setMode(tab, 'split');
    requestAnimationFrame(() => {
      this.syncFrame();
      void tab.browser.open(url).catch((error) => toast(friendlyError(error)));
    });
  }

  // ---------- layout ----------

  private setMode(tab: Tab, mode: Mode): void {
    tab.mode = mode;
    if (tab === this.active) this.applyMode();
  }

  private applyMode(): void {
    const { mode, pageShare } = this.active;
    this.section.classList.toggle('mode-chat', mode === 'chat');
    this.section.classList.toggle('mode-page', mode === 'page');
    this.section.style.setProperty('--page-share', String(pageShare));
    this.section.style.setProperty('--chat-share', String(1 - pageShare));
    requestAnimationFrame(() => {
      this.syncFrame();
      this.syncVisibility();
    });
  }

  private syncFrame(): void {
    if (!this.section?.isConnected) return;
    const r = this.pageArea.getBoundingClientRect();
    if (r.height < 40) return;
    void this.active.browser.setFrame({ x: r.left, y: r.top, width: r.width, height: r.height });
  }

  private syncVisibility(): void {
    const showActive = !this.offscreen && !this.overlayOpen && this.sheetsOpen === 0 && this.active.mode !== 'chat' && !!this.section?.isConnected;
    for (const tab of this.tabs) {
      void tab.browser.setVisible(tab === this.active && showActive);
    }
  }

  private bindDivider(divider: HTMLElement): void {
    let startY = 0;
    let dragging = false;
    let top = 0;
    let free = 0;
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      if (Math.abs(e.clientY - startY) > 4) divider.classList.add('dragging');
      const share = Math.min(0.95, Math.max(0.02, (e.clientY - top) / free));
      if (this.active.mode !== 'split') {
        this.active.mode = 'split';
        this.section.classList.remove('mode-chat', 'mode-page');
        this.syncVisibility();
      }
      this.active.pageShare = share;
      this.section.style.setProperty('--page-share', String(share));
      this.section.style.setProperty('--chat-share', String(1 - share));
      this.syncFrame();
    };
    const onUp = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      divider.releasePointerCapture(e.pointerId);
      const moved = divider.classList.contains('dragging');
      divider.classList.remove('dragging');
      const tab = this.active;
      if (!moved) {
        // Tap: toggle between split and chat only.
        this.setMode(tab, tab.mode === 'split' ? 'chat' : 'split');
        return;
      }
      if (tab.pageShare < SNAP_EDGE) {
        tab.pageShare = 0.55;
        this.setMode(tab, 'chat');
      } else if (tab.pageShare > 1 - SNAP_EDGE) {
        tab.pageShare = 0.55;
        this.setMode(tab, 'page');
      } else {
        this.setMode(tab, 'split');
      }
    };
    divider.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      const pageRect = this.pageArea.getBoundingClientRect();
      const composer = this.section.querySelector('.composer-wrap')?.getBoundingClientRect();
      top = this.section.querySelector('.progress')?.getBoundingClientRect().bottom ?? pageRect.top;
      free = Math.max(1, (composer?.top ?? window.innerHeight) - top - divider.offsetHeight);
      divider.setPointerCapture(e.pointerId);
    });
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
    divider.addEventListener('pointercancel', onUp);
  }

  // ---------- chrome ----------

  private syncChrome(): void {
    if (!this.section) return;
    const b = this.active.browser;
    const hasPage = b.isOpen || !!b.url;
    this.section.classList.toggle('has-page', hasPage);
    this.section.classList.toggle('loading', b.loading);
    if (document.activeElement !== this.address) {
      this.address.value = b.url ? prettyUrl(b.url) : '';
    }
    this.backBtn.hidden = !hasPage;
    this.reloadBtn.hidden = !b.isOpen;
    this.syncStatus();
  }

  private syncStatus(): void {
    const tab = this.active;
    this.status.replaceChildren();
    if (tab.busy && !isAppActive()) {
      this.status.append(h('span', {}, 'Paused · continues when you are back'));
    } else if (tab.browser.isOpen) {
      this.status.append(h('span', {}, tab.browser.title || prettyUrl(tab.browser.url ?? '')));
    } else {
      this.status.append(h('span', {}, 'Chat'));
    }
  }

  private syncTabsButton(): void {
    if (!this.tabsBtn) return;
    const running = this.runningCount;
    this.tabsBtn.replaceChildren(h('span', {}, String(this.tabs.length)));
    this.tabsBtn.classList.toggle('running', running > 0 && !(running === 1 && this.active.busy));
  }

  private syncComposer(): void {
    const tab = this.active;
    const creds = this.host.creds();
    this.input.placeholder = !creds
      ? 'Sign in to use the agent'
      : tab.browser.isOpen
        ? 'Ask about this page or say what to do…'
        : 'Ask the agent to browse…';
    this.send.disabled = !tab.busy && !this.input.value.trim();
    this.send.classList.toggle('stop', tab.busy);
    this.send.replaceChildren(icon(tab.busy ? 'stop' : 'send'));
    this.send.setAttribute('aria-label', tab.busy ? 'Stop' : 'Send');
    this.syncStatus();
  }

  // ---------- start page & welcome ----------

  private renderStartPage(): void {
    const creds = this.host.creds();
    const greeting = creds ? `Good to see you${firstName(creds.email)}` : 'Start browsing';
    this.pageArea.replaceChildren(
      h(
        'div',
        { class: 'start-page' },
        h('h2', {}, greeting),
        h(
          'div',
          { class: 'sites' },
          ...QUICK_SITES.map((site) =>
            h(
              'button',
              { class: 'site', type: 'button', onclick: () => this.openUrl(this.active, site.url) },
              h('span', { class: 'site-icon', style: `background:${site.color}` }, site.label.slice(0, 1)),
              h('span', { class: 'site-label' }, site.label),
            ),
          ),
        ),
      ),
    );
  }

  private renderWelcome(): HTMLElement {
    const creds = this.host.creds();
    return h(
      'div',
      { class: 'welcome' },
      h('h2', {}, creds ? 'What should I do?' : 'Browse, or let the agent do it'),
      h(
        'p',
        { class: 'lede' },
        creds
          ? 'I browse in this tab while you watch. Take over anytime.'
          : 'Sign in with ChatGPT to let the agent browse for you.',
      ),
      h(
        'div',
        { class: 'starters' },
        ...SUGGESTIONS.map((s) =>
          h(
            'button',
            { class: 'starter', type: 'button', onclick: () => this.submit(s.prompt) },
            h('strong', {}, s.title),
            h('span', {}, s.prompt),
          ),
        ),
      ),
    );
  }

  // ---------- composer & agent ----------

  private bindComposer(form: HTMLFormElement, mic: HTMLButtonElement): void {
    this.input.addEventListener('input', () => {
      autoGrow(this.input);
      this.syncComposer();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const tab = this.active;
      if (tab.busy) {
        tab.stopRequested = true;
        tab.cancelPending?.();
        this.send.disabled = true;
        return;
      }
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      autoGrow(this.input);
      this.submit(text);
    });

    const voice = new VoiceInput();
    this.cleanups.push(() => void voice.stop());
    // Leaving the app pauses the agent (see agent/lifecycle) and ends dictation.
    this.cleanups.push(
      onAppActiveChange((active) => {
        if (!active) void voice.stop();
        else {
          this.syncFrame();
          this.syncVisibility();
        }
        this.syncStatus();
        if (active && this.runningCount) toast('Welcome back, the agent continues.');
      }),
    );
    mic.addEventListener('click', async () => {
      if (voice.listening) {
        await voice.stop();
        return;
      }
      if (!this.host.creds()) {
        this.host.openSignIn();
        return;
      }
      const reset = (): void => {
        mic.style.removeProperty('--level');
        mic.classList.remove('listening');
        mic.replaceChildren(icon('mic'));
        this.syncComposer();
      };
      mic.classList.add('listening');
      mic.replaceChildren(icon('stop'));
      this.input.value = '';
      this.input.placeholder = 'Listening… tap ■ when done';
      try {
        await voice.start({
          onPartial: (text) => {
            this.input.value = text;
            autoGrow(this.input);
          },
          onLevel: (level) => {
            // level is ~0..1 (Android dB values are clamped).
            const v = Math.max(0, Math.min(1, level > 1 ? level / 10 : level));
            mic.style.setProperty('--level', String(v));
          },
          onEnd: (text) => {
            reset();
            this.input.value = '';
            autoGrow(this.input);
            if (text) this.submit(text);
          },
          onError: (message) => {
            reset();
            toast(message);
          },
        });
      } catch (error) {
        reset();
        toast(friendlyError(error));
      }
    });
  }

  private submit(text: string): void {
    const creds = this.host.creds();
    if (!creds) {
      this.host.openSignIn();
      return;
    }
    const tab = this.active;
    if (tab.busy) return;
    if (tab.mode === 'chat') this.setMode(tab, 'split');
    // The page must have a frame before the agent opens it.
    this.syncFrame();
    void this.runTurn(tab, creds, text);
  }

  private async runTurn(tab: Tab, creds: OAuthCredentialRecord, text: string): Promise<void> {
    tab.busy = true;
    tab.stopRequested = false;
    tab.lastText = text;
    tab.log.querySelector('.welcome')?.remove();
    if (tab === this.active) this.syncComposer();
    this.syncTabsButton();

    const log = tab.log;
    const turn = h('div', { class: 'turn' });
    turn.append(h('div', { class: 'msg user' }, text));
    const steps = new StepsBlock();
    const answer = h('div', { class: 'msg assistant' });
    const thinking = h('div', { class: 'thinking' }, h('span', { class: 'dot' }));
    turn.append(steps.el, answer, thinking);
    log.append(turn);
    scrollToEnd(log);

    let streamed = '';
    const openLink = (url: string): void => this.openUrl(tab, url);
    const renderAnswer = (value: string): void => {
      answer.replaceChildren(renderMarkdown(value, openLink));
    };

    // Give the model the page this tab shows.
    const pageUrl = tab.browser.isOpen ? tab.browser.url : null;
    const modelText = pageUrl ? `${text}\n\n(The browser currently shows ${pageUrl})` : text;

    try {
      const state = tab.agentState ? appendUserMessage(tab.agentState, modelText) : createInitialState(modelText);
      const result = await runAgentTurn(
        creds,
        state,
        {
          shouldStop: () => tab.stopRequested,
          onAssistantDelta: (delta) => {
            streamed += delta;
            renderAnswer(streamed);
            scrollToEnd(log);
          },
          onToolStart: (name, args) => {
            // One progress indicator: the steps line replaces the dot.
            thinking.remove();
            steps.start(toolLabel(name, args));
            scrollToEnd(log);
          },
          onToolEnd: (_name, ok) => steps.end(ok),
          askUser: (request) => {
            steps.waiting('Waiting for your answer');
            return this.askCard(tab, turn, thinking, request);
          },
          requestSecret: (request) => {
            steps.waiting('Waiting for secure input');
            return this.secretCard(tab, turn, thinking, request);
          },
        },
        tab.browser,
      );
      tab.agentState = result.state;
      const final = result.assistantText || streamed || (tab.stopRequested ? 'Stopped.' : 'Done.');
      renderAnswer(final);
      tab.lastText = final.replace(/\s+/g, ' ').slice(0, 120);
      if (tab !== this.active) toast(`Tab ${this.tabs.indexOf(tab) + 1}: agent finished`);
    } catch (error) {
      answer.classList.add('error');
      answer.textContent = friendlyError(error);
      tab.lastText = answer.textContent;
    } finally {
      thinking.remove();
      steps.finish();
      tab.busy = false;
      scrollToEnd(log);
      if (tab === this.active) this.syncComposer();
      this.syncTabsButton();
    }
  }

  // ---------- question & secret cards ----------

  /** Question from the agent: suggested answers, own answer, or skip. */
  private askCard(tab: Tab, turn: HTMLElement, before: HTMLElement, req: AskUserRequest): Promise<AskUserResult> {
    return new Promise((resolve) => {
      const card = h('div', { class: 'ask-card', role: 'group', 'aria-label': 'Question from the agent' });
      const done = (answer: string | null): void => {
        tab.cancelPending = undefined;
        card.replaceWith(
          h('div', { class: 'answered' }, icon(answer === null ? 'close' : 'check'), h('span', {}, answer === null ? 'Skipped' : answer)),
        );
        resolve({ answer });
        if (tab === this.active) this.syncComposer();
      };
      tab.cancelPending = () => done(null);

      card.append(h('p', { class: 'ask-question' }, req.question));
      if (req.options.length) {
        card.append(
          h(
            'div',
            { class: 'ask-options' },
            ...req.options.map((option) => h('button', { class: 'ask-option', type: 'button', onclick: () => done(option) }, option)),
          ),
        );
      }
      const footer = h('div', { class: 'ask-footer' });
      if (req.allowFreeText) {
        const field = h('input', { type: 'text', placeholder: req.options.length ? 'Or type your answer' : 'Type your answer', enterkeyhint: 'send', 'aria-label': 'Your answer' });
        const send = h('button', { class: 'ask-send', type: 'submit', 'aria-label': 'Send answer' }, icon('send'));
        const form = h('form', { class: 'ask-free' }, field, send);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const value = field.value.trim();
          if (value) done(value);
        });
        footer.append(form);
      }
      footer.append(h('button', { class: 'ghost ask-skip', type: 'button', onclick: () => done(null) }, 'Skip'));
      card.append(footer);
      turn.insertBefore(card, before.isConnected ? before : null);
      scrollToEnd(tab.log);
    });
  }

  /**
   * Secure input for passwords/codes. The value goes straight to the vault
   * (memory, Keychain if remembered) and never into the chat or the model.
   */
  private async secretCard(tab: Tab, turn: HTMLElement, before: HTMLElement, req: SecretRequest): Promise<SecretRequestResult> {
    await vault.load();
    const saved = vault.find(req.name, req.domain);
    if (saved) {
      turn.insertBefore(
        h('div', { class: 'answered secure' }, icon('lock'), h('span', {}, `Used your saved ${saved.label} for ${saved.domain}`)),
        before.isConnected ? before : null,
      );
      return { provided: true, reused: true };
    }

    return new Promise((resolve) => {
      const autocomplete = { password: 'current-password', otp: 'one-time-code', card: 'cc-number', text: 'off' }[req.kind];
      const field = h('input', {
        type: 'password',
        autocomplete,
        inputmode: req.kind === 'otp' || req.kind === 'card' ? 'numeric' : undefined,
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        'aria-label': req.label,
        placeholder: req.label,
      });
      const reveal = h('button', { class: 'icon-btn reveal', type: 'button', 'aria-label': 'Show' }, icon('eye'));
      reveal.addEventListener('click', () => {
        field.type = field.type === 'password' ? 'text' : 'password';
        reveal.replaceChildren(icon(field.type === 'password' ? 'eye' : 'eyeOff'));
      });
      const remember = h('input', { type: 'checkbox', checked: req.kind === 'password' });
      const save = h('button', { class: 'primary', type: 'submit', disabled: true }, 'Use securely');
      const cancel = h('button', { class: 'ghost', type: 'button' }, 'Cancel');
      field.addEventListener('input', () => {
        save.disabled = !field.value;
      });

      const card = h(
        'form',
        { class: 'secret-card', autocomplete: 'on' },
        h('div', { class: 'secret-head' }, icon('lock'), h('strong', {}, req.label)),
        h('p', { class: 'secret-site' }, `For ${req.domain}${req.reason ? ` · ${req.reason}` : ''}`),
        h('div', { class: 'secret-field' }, field, reveal),
        req.kind === 'otp'
          ? null
          : h('label', { class: 'secret-remember' }, remember, h('span', {}, 'Remember on this device (Keychain)')),
        h('p', { class: 'secret-note' }, 'Hidden from the AI and never added to the chat. Only the app fills it on this site.'),
        h('div', { class: 'secret-actions' }, save, cancel),
      );

      const finish = (provided: boolean): void => {
        tab.cancelPending = undefined;
        field.value = '';
        card.replaceWith(
          h('div', { class: 'answered secure' }, icon(provided ? 'lock' : 'close'), h('span', {}, provided ? `${req.label} saved securely · hidden from the AI` : `${req.label} not provided`)),
        );
        resolve({ provided });
        if (tab === this.active) this.syncComposer();
      };
      tab.cancelPending = () => finish(false);
      cancel.addEventListener('click', () => finish(false));
      card.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = field.value;
        if (!value) return;
        save.disabled = true;
        await vault.save({ name: req.name, label: req.label, domain: req.domain, kind: req.kind, value, remember: remember.checked && req.kind !== 'otp' });
        finish(true);
      });

      turn.insertBefore(card, before.isConnected ? before : null);
      scrollToEnd(tab.log);
      if (tab === this.active) requestAnimationFrame(() => field.focus());
    });
  }

  // ---------- overlays ----------

  private openMenu(): void {
    const tab = this.active;
    let close: () => void = () => undefined;
    const rows = h(
      'div',
      { class: 'rows' },
      row('New tab', 'plus', () => {
        close();
        this.newTab();
      }),
      row('New chat in this tab', 'chat', () => {
        close();
        tab.stopRequested = true;
        tab.cancelPending?.();
        tab.agentState = null;
        tab.log.replaceChildren(this.renderWelcome());
      }),
    );
    if (tab.browser.isOpen) {
      rows.append(
        row('Close page', 'close', async () => {
          close();
          await tab.browser.close();
          this.syncChrome();
        }),
      );
    }
    rows.append(
      row('Settings', 'settings', () => {
        close();
        this.host.openSettings();
      }),
    );
    close = this.host.openSheet('Menu', h('div', { class: 'sheet-body' }, rows));
  }

  private async openTabSwitcher(): Promise<void> {
    // Thumbnail of the visible tab before hiding the native pages.
    const current = this.active;
    if (current.browser.isOpen && current.mode !== 'chat') {
      try {
        const shot = await current.browser.takeScreenshot();
        current.thumb = shot.startsWith('data:') ? shot : `data:image/png;base64,${shot}`;
      } catch {
        /* keep previous thumbnail */
      }
    }
    this.overlayOpen = true;
    this.syncVisibility();

    const overlay = h('div', { class: 'tabs-overlay', role: 'dialog', 'aria-label': 'Tabs' });
    const close = (): void => {
      overlay.remove();
      this.overlayOpen = false;
      this.syncVisibility();
    };
    const grid = h('div', { class: 'tab-grid' });
    const renderGrid = (): void => {
      grid.replaceChildren(
        ...this.tabs.map((tab) => {
          const title = tab.browser.title || (tab.browser.url ? prettyUrl(tab.browser.url) : 'Start page');
          const preview = tab.thumb
            ? h('img', { src: tab.thumb, alt: '' })
            : h('div', { class: 'tab-blank' }, icon(tab.browser.url ? 'globe' : 'sparkles'));
          const closeBtn = h('button', { class: 'tab-close', type: 'button', 'aria-label': 'Close tab' }, icon('close'));
          closeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.closeTab(tab);
            renderGrid();
          });
          const card = h(
            'button',
            { class: `tab-card${tab === this.active ? ' current' : ''}`, type: 'button' },
            h('div', { class: 'tab-preview' }, preview, tab.busy ? h('span', { class: 'tab-busy' }, h('span', { class: 'spinner' }), 'Working') : null),
            h('div', { class: 'tab-meta' }, h('strong', {}, title), h('span', {}, tab.lastText || 'No chat yet')),
            closeBtn,
          );
          card.addEventListener('click', () => {
            close();
            this.showTab(tab);
          });
          return card;
        }),
      );
    };
    renderGrid();

    const newBtn = h('button', { class: 'primary new-tab', type: 'button' }, icon('plus'), h('span', {}, 'New tab'));
    newBtn.addEventListener('click', () => {
      close();
      this.newTab();
    });
    overlay.append(
      h(
        'div',
        { class: 'tabs-head' },
        h('h3', {}, `${this.tabs.length} ${this.tabs.length === 1 ? 'tab' : 'tabs'}`),
        h('button', { class: 'ghost', type: 'button', onclick: close }, 'Done'),
      ),
      grid,
      h('div', { class: 'tabs-foot' }, newBtn),
    );
    document.body.append(overlay);
  }
}

/** ChatGPT-style collapsible "Browsing · N steps" block for agent actions. */
class StepsBlock {
  readonly el: HTMLElement;
  private head: HTMLButtonElement;
  private list: HTMLElement;
  private count = 0;

  constructor() {
    this.head = h('button', { class: 'steps-head', type: 'button' });
    this.list = h('ol', { class: 'steps-list' });
    this.el = h('div', { class: 'steps', hidden: true }, this.head, this.list);
    this.head.addEventListener('click', () => this.el.classList.toggle('open'));
    this.renderHead(true);
  }

  start(label: string): void {
    this.el.hidden = false;
    this.count += 1;
    this.list.append(h('li', { class: 'running' }, h('span', { class: 'step-dot' }), h('span', {}, label)));
    this.renderHead(true, label);
  }

  end(ok: boolean): void {
    const li = this.list.lastElementChild;
    li?.classList.remove('running');
    li?.classList.add(ok ? 'ok' : 'failed');
    this.renderHead(true, 'Thinking…');
  }

  finish(): void {
    if (this.count) this.renderHead(false);
  }

  waiting(label: string): void {
    this.el.hidden = false;
    this.head.replaceChildren(icon('hand'), h('span', { class: 'steps-title' }, label), icon('chevron', 'icon steps-chevron'));
  }

  private renderHead(running: boolean, current?: string): void {
    this.head.replaceChildren(
      running ? h('span', { class: 'spinner' }) : icon('globe'),
      h('span', { class: 'steps-title' }, running ? (current ?? 'Browsing…') : `Browsed · ${this.count} ${this.count === 1 ? 'step' : 'steps'}`),
      icon('chevron', 'icon steps-chevron'),
    );
  }
}

/** Friendly name for an app link scheme. */
function describeExternal(url: string): { app: string; detail?: string } {
  const scheme = (url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1] ?? '').toLowerCase();
  const rest = decodeURIComponent(url.slice(scheme.length + 1).replace(/^\/\//, '')).split('?')[0] ?? '';
  switch (scheme) {
    case 'mailto':
      return { app: 'Mail', detail: rest };
    case 'tel':
    case 'telprompt':
      return { app: 'Phone', detail: rest };
    case 'sms':
      return { app: 'Messages', detail: rest };
    case 'facetime':
    case 'facetime-audio':
      return { app: 'FaceTime', detail: rest };
    case 'maps':
      return { app: 'Maps' };
    case 'itms-apps':
    case 'itms-appss':
      return { app: 'the App Store' };
    default: {
      const name = scheme.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { app: name ? `the ${name} app` : 'another app' };
    }
  }
}
