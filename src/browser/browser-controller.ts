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

type BrowserStateListener = (open: boolean) => void;

let activeWebViewId: string | undefined;
let frame: BrowserFrame | null = null;
const stateListeners = new Set<BrowserStateListener>();
let pageLoadWaiters: Array<() => void> = [];
let lastKnownUrl = 'https://example.com';
let listenersReady: Promise<void> | undefined;

function requireBrowser(): string {
  if (!activeWebViewId) throw new Error('Browser is not open. Navigate to a page first.');
  return activeWebViewId;
}

export function isBrowserOpen(): boolean {
  return activeWebViewId !== undefined;
}

export async function closeBrowser(): Promise<void> {
  if (!activeWebViewId) return;
  const id = activeWebViewId;
  await InAppBrowser.close({ id });
  if (activeWebViewId === id) setActive(undefined);
}

/** Notified when the browser opens or closes (drives the split layout). */
export function onBrowserStateChange(listener: BrowserStateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function setActive(id: string | undefined): void {
  const changed = (id === undefined) !== (activeWebViewId === undefined);
  activeWebViewId = id;
  if (changed) for (const listener of stateListeners) listener(id !== undefined);
}

/**
 * Place the browser in a region of the screen (CSS px == iOS points) so the
 * chat stays visible below it. `null` means full screen for the next open.
 */
export async function setBrowserFrame(next: BrowserFrame | null): Promise<void> {
  frame = next;
  if (activeWebViewId && next) {
    await InAppBrowser.updateDimensions({ id: activeWebViewId, ...roundFrame(next) });
  }
}

function roundFrame(f: BrowserFrame): BrowserFrame {
  return { x: Math.round(f.x), y: Math.round(f.y), width: Math.round(f.width), height: Math.round(f.height) };
}

/** Resolves on the next main-frame load, or after `timeoutMs`. */
function waitForPageLoad(timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      pageLoadWaiters = pageLoadWaiters.filter((w) => w !== done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    pageLoadWaiters.push(done);
  });
}

/** Draw a short-lived marker in the page so the user sees where the agent acts. */
async function showMarker(kind: 'tap' | 'type', x: number, y: number): Promise<void> {
  if (!activeWebViewId) return;
  const code = `
    (() => {
      const d = document.createElement('div');
      const size = ${kind === 'tap' ? 44 : 56};
      d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:999px;' +
        'left:' + (${x} - size / 2) + 'px;top:' + (${y} - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;' +
        'border:3px solid #34d399;background:rgba(52,211,153,.25);box-shadow:0 0 0 6px rgba(52,211,153,.15);' +
        'transition:transform .5s ease,opacity .5s ease;transform:scale(.4);opacity:1';
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = 'scale(1.3)'; });
      setTimeout(() => { d.style.opacity = '0'; }, 550);
      setTimeout(() => d.remove(), 1100);
    })();
  `;
  await InAppBrowser.executeScript({ id: activeWebViewId, code }).catch(() => undefined);
}

async function registerBrowserListeners(): Promise<void> {
  await InAppBrowser.addListener('urlChangeEvent', (event) => {
    if (activeWebViewId && (!event.id || event.id === activeWebViewId)) {
      lastKnownUrl = event.url;
    }
  });
  await InAppBrowser.addListener('closeEvent', (event) => {
    if (!event.id || event.id === activeWebViewId) setActive(undefined);
  });
  await InAppBrowser.addListener('browserPageLoaded', (event) => {
    if (event.id && activeWebViewId && event.id !== activeWebViewId) return;
    for (const waiter of [...pageLoadWaiters]) waiter();
  });
}

async function runScriptReturning<T>(script: string): Promise<T> {
  const id = requireBrowser();
  const requestId = crypto.randomUUID();
  const channel = `capgo-dom-${requestId}`;

  const listenerPromise = new Promise<T>((resolve, reject) => {
    let handle: PluginListenerHandle | undefined;
    const timeout = window.setTimeout(() => {
      void handle?.remove();
      reject(new Error('Timed out waiting for webview message'));
    }, 15_000);

    void InAppBrowser.addListener('messageFromWebview', (event) => {
      const detail = event.detail as { channel?: string; payload?: T; error?: string };
      if (detail?.channel !== channel) {
        return;
      }
      window.clearTimeout(timeout);
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
        window.mobileApp.postMessage({
          detail: { channel: ${JSON.stringify(channel)}, payload }
        });
      } catch (error) {
        window.mobileApp.postMessage({
          detail: { channel: ${JSON.stringify(channel)}, error: String(error) }
        });
      }
    })();
  `;

  await InAppBrowser.executeScript({ id, code: wrapped });
  return listenerPromise;
}

export async function openBrowser(url: string): Promise<void> {
  listenersReady ??= registerBrowserListeners();
  await listenersReady;
  if (activeWebViewId) {
    await navigate(url);
    return;
  }
  const loaded = waitForPageLoad();
  const result = await InAppBrowser.openWebView({
    url,
    ...(frame
      ? { ...roundFrame(frame), toolbarType: ToolBarType.BLANK }
      : {
          toolbarType: ToolBarType.NAVIGATION,
          showReloadButton: true,
          visibleTitle: true,
          enabledSafeBottomMargin: true,
          enabledSafeTopMargin: true,
        }),
  });
  setActive(result.id);
  lastKnownUrl = url;
  await loaded;
}

export async function navigate(url: string): Promise<void> {
  if (!isBrowserOpen()) return openBrowser(url);
  const loaded = waitForPageLoad();
  await InAppBrowser.setUrl({ url, id: requireBrowser() });
  lastKnownUrl = url;
  await loaded;
}

export async function goBack(): Promise<void> {
  await InAppBrowser.goBack({ id: requireBrowser() });
}

export async function takeScreenshot(): Promise<string> {
  const shot = await InAppBrowser.takeScreenshot({ id: requireBrowser() });
  return shot.base64;
}

export async function clickAt(x: number, y: number, marker: 'tap' | 'type' = 'tap'): Promise<void> {
  await showMarker(marker, x, y);
  await InAppBrowser.dispatchInputEvent({
    id: requireBrowser(),
    type: 'click',
    x,
    y,
  });
}

export async function scrollBy(dx: number, dy: number): Promise<void> {
  await InAppBrowser.dispatchInputEvent({
    id: requireBrowser(),
    type: 'scroll',
    x: 200,
    y: 400,
    deltaX: dx,
    deltaY: dy,
  });
}

export async function typeText(text: string, x: number, y: number): Promise<void> {
  await clickAt(x, y, 'type');
  const escaped = JSON.stringify(text);
  await InAppBrowser.executeScript({
    id: requireBrowser(),
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

export interface PageElement {
  tag: string;
  text: string;
  x: number;
  y: number;
}

export async function readDom(): Promise<{
  title: string;
  url: string;
  viewport: { width: number; height: number };
  text: string;
  elements: PageElement[];
}> {
  return runScriptReturning(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const nodes = document.querySelectorAll(
      'a[href],button,input,textarea,select,[role=button],[role=link],[onclick],[contenteditable=true]'
    );
    const elements = [];
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const label = (el.innerText || el.value || el.getAttribute('aria-label') ||
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
export async function viewportSize(): Promise<{ width: number; height: number }> {
  return runScriptReturning('({ width: window.innerWidth, height: window.innerHeight })');
}

export async function extractSelector(selector: string): Promise<{
  found: boolean;
  text?: string;
  html?: string;
}> {
  const sel = JSON.stringify(selector);
  return runScriptReturning<{ found: boolean; text?: string; html?: string }>(`(() => {
    const el = document.querySelector(${sel});
    if (!el) return { found: false };
    return {
      found: true,
      text: (el.textContent || '').slice(0, 8000),
      html: (el.outerHTML || '').slice(0, 8000),
    };
  })()`);
}

export async function getSnapshot(): Promise<BrowserSnapshot> {
  const dom = await readDom();
  let screenshotBase64: string | undefined;
  try {
    screenshotBase64 = await takeScreenshot();
  } catch {
    screenshotBase64 = undefined;
  }
  return {
    url: lastKnownUrl,
    title: dom.title,
    domText: dom.text,
    screenshotBase64,
  };
}

/** URL of the page currently shown, or null when the browser is closed. */
export function currentUrl(): string | null {
  return activeWebViewId ? lastKnownUrl : null;
}

/** Temporarily hide the native browser (e.g. while an HTML sheet is shown). */
export async function setBrowserVisible(visible: boolean): Promise<void> {
  if (!activeWebViewId) return;
  const id = activeWebViewId;
  await (visible ? InAppBrowser.show({ id }) : InAppBrowser.hide({ id })).catch(() => undefined);
}
