import type { PluginListenerHandle } from '@capacitor/core';
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';

export interface BrowserSnapshot {
  url: string;
  title?: string;
  screenshotBase64?: string;
  domText?: string;
}

let activeWebViewId: string | undefined;
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
  if (activeWebViewId === id) activeWebViewId = undefined;
}

async function registerBrowserListeners(): Promise<void> {
  await InAppBrowser.addListener('urlChangeEvent', (event) => {
    if (activeWebViewId && (!event.id || event.id === activeWebViewId)) {
      lastKnownUrl = event.url;
    }
  });
  await InAppBrowser.addListener('closeEvent', (event) => {
    if (!event.id || event.id === activeWebViewId) activeWebViewId = undefined;
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
  const result = await InAppBrowser.openWebView({
    url,
    toolbarType: ToolBarType.NAVIGATION,
    showReloadButton: true,
    visibleTitle: true,
    enabledSafeBottomMargin: true,
    enabledSafeTopMargin: true,
  });
  activeWebViewId = result.id;
  lastKnownUrl = url;
}

export async function navigate(url: string): Promise<void> {
  if (!isBrowserOpen()) return openBrowser(url);
  await InAppBrowser.setUrl({ url, id: requireBrowser() });
  lastKnownUrl = url;
}

export async function goBack(): Promise<void> {
  await InAppBrowser.goBack({ id: requireBrowser() });
}

export async function takeScreenshot(): Promise<string> {
  const shot = await InAppBrowser.takeScreenshot({ id: requireBrowser() });
  return shot.base64;
}

export async function clickAt(x: number, y: number): Promise<void> {
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
  await clickAt(x, y);
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

export async function readDom(): Promise<{ title: string; text: string }> {
  return runScriptReturning<{ title: string; text: string }>(`({
    title: document.title ?? '',
    text: (document.body?.innerText ?? '').slice(0, 12000),
  })`);
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
