import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { h, icon } from './dom';

export function row(label: string, trailing: Parameters<typeof icon>[0], onTap: () => void | Promise<void>): HTMLElement {
  return h(
    'button',
    { class: 'row', type: 'button', onclick: () => void onTap() },
    h('span', {}, label),
    icon(trailing),
  );
}

export function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
  return h('div', { class: `bubble ${role}` }, text);
}

export const TOOL_LABELS: Record<string, string> = {
  browser_navigate: 'Opening',
  browser_screenshot: 'Looking at the page',
  browser_click: 'Clicking',
  browser_type: 'Typing',
  browser_scroll: 'Scrolling',
  browser_read_dom: 'Reading the page',
  browser_extract: 'Extracting details',
};

export function toolChip(name: string, args?: Record<string, unknown>): HTMLElement {
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

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '');
  } catch {
    return url;
  }
}

export function toast(message: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  window.setTimeout(() => el.classList.add('out'), 2600);
  window.setTimeout(() => el.remove(), 3000);
}

export function scrollToEnd(el: HTMLElement): void {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

export function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

export function firstName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const name = local.split(/[._-]/)[0] ?? '';
  if (!name || /\d/.test(name)) return '';
  return `, ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function toUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

export async function openExternal(url: string): Promise<void> {
  try {
    await InAppBrowser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/usage limit/i.test(message)) {
    return 'You reached your ChatGPT plan usage limit. Try again later.';
  }
  if (/cancel/i.test(message)) {
    return 'Sign in was cancelled.';
  }
  if (!navigator.onLine || /internet connection appears to be offline|network connection was lost/i.test(message)) {
    return 'No connection. Check your internet and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}
