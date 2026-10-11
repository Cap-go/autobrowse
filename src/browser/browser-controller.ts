import type { PluginListenerHandle } from '@capacitor/core';
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';

export interface BrowserSnapshot {
  url: string;
  title?: string;
  screenshotBase64?: string;
  domText?: string;
}

export interface BrowserFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageElement {
  tag: string;
  text: string;
  x: number;
  y: number;
}

export interface PageRead {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  text: string;
  elements: PageElement[];
}

type TabListener = (tab: BrowserTab) => void;

/** Native webview id -> tab, so plugin events reach the right tab. */
const tabsByWebView = new Map<string, BrowserTab>();
let listenersReady: Promise<void> | undefined;

function roundFrame(f: BrowserFrame): BrowserFrame {
  return { x: Math.round(f.x), y: Math.round(f.y), width: Math.round(f.width), height: Math.round(f.height) };
}

/** Channel used by the in-page link guard to report app links. */
const EXTERNAL_LINK_CHANNEL = 'capgo-external-link';

/**
 * Runs at document start in every page and frame. Taps on links (or
 * window.open calls) with a non-web scheme such as mailto:, tel:, youtube://
 * are stopped and reported to the app, which asks before leaving. HTTPS links
 * stay in the browser because preventDeeplink is on.
 */
const LINK_GUARD_SCRIPT = `(() => {
  if (window.__autoBrowseLinkGuard) return;
  window.__autoBrowseLinkGuard = true;
  const WEB = ['http', 'https', 'about', 'javascript', 'data', 'blob'];
  const external = (href) => {
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(String(href || ''));
    return m && WEB.indexOf(m[1].toLowerCase()) < 0;
  };
  const report = (url) => {
    try { window.mobileApp.postMessage({ detail: { channel: '${EXTERNAL_LINK_CHANNEL}', url: String(url) } }); } catch (e) {}
  };
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !external(a.href || a.getAttribute('href'))) return;
    e.preventDefault();
    e.stopPropagation();
    report(a.href || a.getAttribute('href'));
  }, true);
  const open = window.open;
  window.open = function (url) {
    if (external(url)) { report(url); return null; }
    return open.apply(this, arguments);
  };
})();`;

type ExternalLinkHandler = (tab: BrowserTab, url: string) => void;
let externalLinkHandler: ExternalLinkHandler | null = null;

/** Called when a page wants to open another app. The UI decides (asks the user). */
export function onExternalLink(handler: ExternalLinkHandler): void {
  externalLinkHandler = handler;
}

async function registerBrowserListeners(): Promise<void> {
  await InAppBrowser.addListener('messageFromWebview', (event) => {
    const detail = event.detail as { channel?: string; url?: string } | undefined;
    if (detail?.channel !== EXTERNAL_LINK_CHANNEL || !detail.url) return;
    const tab = event.id ? tabsByWebView.get(event.id) : undefined;
    if (tab) externalLinkHandler?.(tab, detail.url);
  });
  await InAppBrowser.addListener('urlChangeEvent', (event) => {
    const tab = event.id ? tabsByWebView.get(event.id) : undefined;
    tab?.handleUrl(event.url);
  });
  await InAppBrowser.addListener('closeEvent', (event) => {
    const tab = event.id ? tabsByWebView.get(event.id) : undefined;
    tab?.handleClosed();
  });
  await InAppBrowser.addListener('browserPageLoaded', (event) => {
    const tab = event.id ? tabsByWebView.get(event.id) : undefined;
    tab?.handleLoaded();
  });
}

/**
 * One browser tab backed by its own native Capgo InAppBrowser webview.
 * Several tabs can live at once (each with its own agent); only the visible
 * one is shown, framed above the chat.
 */
export class BrowserTab {
  webViewId: string | undefined;
  url: string | null = null;
  title = '';
  loading = false;
  private frame: BrowserFrame | null = null;
  private visible = true;
  private loadWaiters: Array<() => void> = [];
  private listeners = new Set<TabListener>();

  get isOpen(): boolean {
    return this.webViewId !== undefined;
  }

  /** Notified on open/close, URL and loading changes. */
  onChange(listener: TabListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this);
  }

  handleUrl(url: string): void {
    this.url = url;
    this.emit();
  }

  handleLoaded(): void {
    this.loading = false;
    for (const waiter of [...this.loadWaiters]) waiter();
    void this.refreshTitle();
    this.emit();
  }

  handleClosed(): void {
    if (this.webViewId) tabsByWebView.delete(this.webViewId);
    this.webViewId = undefined;
    this.loading = false;
    this.emit();
  }

  private requireId(): string {
    if (!this.webViewId) throw new Error('Browser is not open. Navigate to a page first.');
    return this.webViewId;
  }

  /** Resolves on the next main-frame load, or after `timeoutMs`. */
  private waitForPageLoad(timeoutMs = 12_000): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.loadWaiters = this.loadWaiters.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.loadWaiters.push(done);
    });
  }

  /** Where the page is drawn (CSS px == iOS points). `null` = full screen. */
  async setFrame(next: BrowserFrame | null): Promise<void> {
    this.frame = next;
    if (this.webViewId && next) {
      await InAppBrowser.updateDimensions({ id: this.webViewId, ...roundFrame(next) }).catch(() => undefined);
    }
  }

  /** Show or hide the native page without closing it (tab switch, sheets). */
  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible;
    if (!this.webViewId) return;
    const id = this.webViewId;
    await (visible ? InAppBrowser.show({ id }) : InAppBrowser.hide({ id })).catch(() => undefined);
  }

  async open(url: string): Promise<void> {
    listenersReady ??= registerBrowserListeners();
    await listenersReady;
    if (this.webViewId) {
      await this.navigate(url);
      return;
    }
    this.loading = true;
    this.url = url;
    this.emit();
    const loaded = this.waitForPageLoad();
    const result = await InAppBrowser.openWebView({
      url,
      ...(this.frame
        ? { ...roundFrame(this.frame), toolbarType: ToolBarType.BLANK }
        : {
            toolbarType: ToolBarType.NAVIGATION,
            showReloadButton: true,
            visibleTitle: true,
            enabledSafeBottomMargin: true,
            enabledSafeTopMargin: true,
          }),
      ...(this.visible ? {} : { hidden: true }),
      // Links never jump to other apps on their own; app schemes are asked first.
      preventDeeplink: true,
      preShowScript: LINK_GUARD_SCRIPT,
      preShowScriptInjectionTime: 'documentStart',
    });
    this.webViewId = result.id;
    tabsByWebView.set(result.id, this);
    this.emit();
    await loaded;
  }

  async navigate(url: string): Promise<void> {
    if (!this.webViewId) return this.open(url);
    this.loading = true;
    this.url = url;
    this.emit();
    const loaded = this.waitForPageLoad();
    await InAppBrowser.setUrl({ url, id: this.webViewId });
    await loaded;
  }

  async close(): Promise<void> {
    if (!this.webViewId) return;
    const id = this.webViewId;
    await InAppBrowser.close({ id }).catch(() => undefined);
    if (this.webViewId === id) this.handleClosed();
  }

  async goBack(): Promise<void> {
    await InAppBrowser.goBack({ id: this.requireId() });
  }

  async reload(): Promise<void> {
    await InAppBrowser.reload({ id: this.requireId() });
  }

  async takeScreenshot(): Promise<string> {
    const shot = await InAppBrowser.takeScreenshot({ id: this.requireId() });
    return shot.base64;
  }

  async clickAt(x: number, y: number, marker: 'tap' | 'type' = 'tap'): Promise<void> {
    const id = this.requireId();
    await this.showMarker(marker, x, y);
    await InAppBrowser.dispatchInputEvent({ id, type: 'click', x, y });
  }

  async scrollBy(dx: number, dy: number): Promise<void> {
    await InAppBrowser.dispatchInputEvent({
      id: this.requireId(),
      type: 'scroll',
      x: 200,
      y: 400,
      deltaX: dx,
      deltaY: dy,
    });
  }

  async typeText(text: string, x: number, y: number): Promise<void> {
    await this.clickAt(x, y, 'type');
    const escaped = JSON.stringify(text);
    await InAppBrowser.executeScript({
      id: this.requireId(),
      code: `
        (() => {
          const active = document.activeElement;
          if (active && 'value' in active) {
            active.value = ${escaped};
            active.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })();
      `,
    });
  }

  /**
   * Fill a field with a value the model must not see (passwords, codes).
   * Target by CSS selector or by viewport point. Uses the native value setter
   * so React/Vue inputs notice the change. Returns what kind of field it was.
   */
  async fillValue(value: string, target: { selector?: string; x?: number; y?: number }): Promise<{ filled: boolean; field: string }> {
    this.requireId();
    if (target.x !== undefined && target.y !== undefined) await this.showMarker('type', target.x, target.y);
    const code = `(() => {
      const sel = ${JSON.stringify(target.selector ?? '')};
      let el = sel ? document.querySelector(sel) : document.elementFromPoint(${Number(target.x ?? -1)}, ${Number(target.y ?? -1)});
      if (el && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        el = el.querySelector('input,textarea') || el.closest('label')?.querySelector('input,textarea') || el;
      }
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { filled: false, field: el ? el.tagName.toLowerCase() : 'none' };
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { filled: true, field: (el.type || el.tagName).toLowerCase() };
    })()`;
    return this.runScriptReturning(code);
  }

  async readDom(): Promise<PageRead> {
    return this.runScriptReturning(`(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const nodes = document.querySelectorAll(
        'a[href],button,input,textarea,select,[role=button],[role=link],[onclick],[contenteditable=true]'
      );
      const elements = [];
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        // Never expose what is typed in password/sensitive fields.
        const sensitive = el.type === 'password' || /cc-|one-time-code|current-password|new-password/.test(el.autocomplete || '');
        const label = (el.innerText || (sensitive ? '' : el.value) || el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '').trim();
        elements.push({
          tag: el.tagName.toLowerCase() + (el.type ? ':' + el.type : ''),
          text: label.replace(/\\s+/g, ' ').slice(0, 80),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        });
        if (elements.length >= 80) break;
      }
      return {
        title: document.title || '',
        url: location.href,
        viewport: { width: vw, height: vh },
        text: (document.body ? document.body.innerText : '').slice(0, 10000),
        elements,
      };
    })()`);
  }

  /** CSS viewport size, used to map screenshot pixels to click coordinates. */
  async viewportSize(): Promise<{ width: number; height: number }> {
    return this.runScriptReturning('({ width: window.innerWidth, height: window.innerHeight })', 2_000);
  }

  async extractSelector(selector: string): Promise<{ found: boolean; text?: string; html?: string }> {
    const sel = JSON.stringify(selector);
    return this.runScriptReturning(`(() => {
      const el = document.querySelector(${sel});
      if (!el) return { found: false };
      return {
        found: true,
        text: (el.textContent || '').slice(0, 8000),
        html: (el.outerHTML || '').slice(0, 8000),
      };
    })()`);
  }

  async getSnapshot(): Promise<BrowserSnapshot> {
    const dom = await this.readDom();
    let screenshotBase64: string | undefined;
    try {
      screenshotBase64 = await this.takeScreenshot();
    } catch {
      screenshotBase64 = undefined;
    }
    return { url: this.url ?? '', title: dom.title, domText: dom.text, screenshotBase64 };
  }

  private async refreshTitle(): Promise<void> {
    if (!this.webViewId) return;
    try {
      const title = await this.runScriptReturning<string>('document.title || ""', 4_000);
      if (title && title !== this.title) {
        this.title = title;
        this.emit();
      }
    } catch {
      /* title is cosmetic */
    }
  }

  /** Draw a short-lived marker in the page so the user sees where the agent acts. */
  private async showMarker(kind: 'tap' | 'type', x: number, y: number): Promise<void> {
    if (!this.webViewId) return;
    const code = `
      (() => {
        const d = document.createElement('div');
        const size = ${kind === 'tap' ? 44 : 56};
        d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:999px;' +
          'left:' + (${x} - size / 2) + 'px;top:' + (${y} - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;' +
          'border:3px solid #34d399;background:rgba(52,211,153,.25);' +
          'transition:transform .5s ease,opacity .5s ease;transform:scale(.4);opacity:1';
        document.documentElement.appendChild(d);
        requestAnimationFrame(() => { d.style.transform = 'scale(1.3)'; });
        setTimeout(() => { d.style.opacity = '0'; }, 550);
        setTimeout(() => d.remove(), 1100);
      })();
    `;
    await InAppBrowser.executeScript({ id: this.webViewId, code }).catch(() => undefined);
  }

  private async runScriptReturning<T>(script: string, timeoutMs = 15_000): Promise<T> {
    const id = this.requireId();
    const channel = `capgo-dom-${crypto.randomUUID()}`;

    const listenerPromise = new Promise<T>((resolve, reject) => {
      let handle: PluginListenerHandle | undefined;
      const timeout = setTimeout(() => {
        void handle?.remove();
        reject(new Error('Timed out waiting for webview message'));
      }, timeoutMs);

      void InAppBrowser.addListener('messageFromWebview', (event) => {
        const detail = event.detail as { channel?: string; payload?: T; error?: string };
        if (detail?.channel !== channel) return;
        clearTimeout(timeout);
        void handle?.remove();
        if (detail.error) {
          reject(new Error(detail.error));
          return;
        }
        resolve(detail.payload as T);
      }).then((h) => {
        handle = h;
      });
    });

    const wrapped = `
      (() => {
        try {
          const payload = (${script});
          window.mobileApp.postMessage({ detail: { channel: ${JSON.stringify(channel)}, payload } });
        } catch (error) {
          window.mobileApp.postMessage({ detail: { channel: ${JSON.stringify(channel)}, error: String(error) } });
        }
      })();
    `;

    await InAppBrowser.executeScript({ id, code: wrapped });
    return listenerPromise;
  }
}

/** Tab used when no specific tab is given (tests, single-tab callers). */
export const defaultTab = new BrowserTab();
