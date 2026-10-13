/**
 * Deep links that start Auto Browse from other apps, web pages, ChatGPT,
 * Shortcuts or QR codes. Documented at https://autobrowse.dev/deeplinks/
 *
 *   autobrowse://run?prompt=…&url=https://…&tab=new|current
 *   autobrowse://open?url=https://…
 *   https://autobrowse.dev/run?… and /open?… (universal links)
 *   https://capgo.app/autobrowse/run?… and /autobrowse/open?… (older links, still accepted)
 */
export interface DeepLinkAction {
  action: 'run' | 'open';
  prompt?: string;
  url?: string;
  tab: 'new' | 'current';
}

export const DEEPLINK_SCHEME = 'autobrowse';
export const DEEPLINK_HOSTS = ['autobrowse.dev', 'www.autobrowse.dev'];
const LEGACY_HOSTS = ['capgo.app', 'www.capgo.app'];
const MAX_PROMPT = 2000;

export function parseDeepLink(raw: string): DeepLinkAction | null {
  let link: URL;
  try {
    link = new URL(raw);
  } catch {
    return null;
  }

  let action: string | undefined;
  if (link.protocol === `${DEEPLINK_SCHEME}:`) {
    // autobrowse://run?… parses with host "run"; autobrowse:run?… with pathname "run".
    action = link.host || link.pathname.replace(/^\/+/, '');
  } else if (link.protocol === 'https:' && DEEPLINK_HOSTS.includes(link.hostname)) {
    action = link.pathname.match(/^\/(run|open)\/?$/)?.[1];
  } else if (link.protocol === 'https:' && LEGACY_HOSTS.includes(link.hostname)) {
    action = link.pathname.match(/^\/autobrowse\/(run|open)\/?$/)?.[1];
  }
  action = action?.replace(/\/+$/, '').toLowerCase();
  if (action !== 'run' && action !== 'open') return null;

  const params = link.searchParams;
  const prompt = params.get('prompt')?.trim().slice(0, MAX_PROMPT) || undefined;
  const url = safeUrl(params.get('url'));
  const tab = params.get('tab') === 'current' ? 'current' : 'new';

  if (action === 'run' && !prompt && !url) return null;
  if (action === 'open' && !url) return null;
  return { action, prompt: action === 'run' ? prompt : undefined, url, tab };
}

function safeUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
