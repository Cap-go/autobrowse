import { type BrowserTab, defaultTab } from '../browser/browser-controller';
import { normalizeSecretName, siteOf, vault } from '../secrets/vault';
import type { AskUserRequest, AskUserResult, BrowserToolName, SecretRequest, SecretRequestResult, ToolOutput } from './types';

/** UI callbacks for tools that need the user (cards in the chat). */
export interface UserToolHandlers {
  askUser?: (request: AskUserRequest) => Promise<AskUserResult>;
  requestSecret?: (request: SecretRequest) => Promise<SecretRequestResult>;
}

export async function runBrowserTool(
  name: BrowserToolName,
  args: Record<string, unknown>,
  browser: BrowserTab = defaultTab,
  handlers: UserToolHandlers = {},
): Promise<ToolOutput> {
  switch (name) {
    case 'ask_user': {
      if (!handlers.askUser) throw new Error('Asking the user is not available here.');
      const options = Array.isArray(args.options) ? args.options.map(String).filter(Boolean).slice(0, 6) : [];
      const result = await handlers.askUser({
        question: String(args.question ?? ''),
        options,
        allowFreeText: args.allow_free_text !== false,
      });
      return JSON.stringify(result.answer === null ? { skipped: true } : { answer: result.answer });
    }
    case 'request_secret': {
      if (!handlers.requestSecret) throw new Error('Secure input is not available here.');
      const secretName = normalizeSecretName(String(args.name ?? 'secret'));
      const domain = siteOf(browser.url);
      if (!domain) throw new Error('Open the site that needs the secret first, then request it.');
      const kind = (['password', 'otp', 'card', 'text'] as const).find((k) => k === args.kind) ?? 'text';
      const result = await handlers.requestSecret({
        name: secretName,
        label: String(args.label ?? secretName),
        reason: String(args.reason ?? ''),
        kind,
        domain,
      });
      return JSON.stringify(
        result.provided
          ? { ok: true, secret: `secret:${secretName}`, site: domain, reused: !!result.reused,
              note: 'Use browser_fill_secret with this reference. The value is never shown to you.' }
          : { ok: false, declined: true },
      );
    }
    case 'browser_fill_secret': {
      const ref = String(args.secret ?? '');
      const value = vault.valueForFill(ref, siteOf(browser.url));
      const target = {
        selector: typeof args.selector === 'string' ? args.selector : undefined,
        x: typeof args.x === 'number' ? args.x : undefined,
        y: typeof args.y === 'number' ? args.y : undefined,
      };
      if (!target.selector && (target.x === undefined || target.y === undefined)) {
        throw new Error('Give x/y of the field or a CSS selector.');
      }
      const result = await browser.fillValue(value, target);
      if (!result.filled) throw new Error(`No input field at that position (found ${result.field}).`);
      return JSON.stringify({ ok: true, filled: ref, field: result.field });
    }
    case 'browser_navigate': {
      const url = String(args.url ?? '');
      if (!url.startsWith('https://')) {
        throw new Error('Only https URLs are allowed');
      }
      await browser.navigate(url);
      return JSON.stringify({ ok: true, url });
    }
    case 'browser_screenshot': {
      const base64 = await browser.takeScreenshot();
      const viewport = await browser.viewportSize().catch(() => null);
      return [
        {
          type: 'input_text',
          text: JSON.stringify({
            ok: true,
            viewport,
            note: 'Click/type coordinates are CSS pixels of the viewport; the image may be larger (device pixels).',
          }),
        },
        {
          type: 'input_image',
          image_url: base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`,
          detail: 'auto',
        },
      ];
    }
    case 'browser_click': {
      await browser.clickAt(Number(args.x), Number(args.y));
      return JSON.stringify({ ok: true });
    }
    case 'browser_type': {
      await browser.typeText(String(args.text ?? ''), Number(args.x), Number(args.y));
      return JSON.stringify({ ok: true });
    }
    case 'browser_scroll': {
      await browser.scrollBy(Number(args.deltaX ?? 0), Number(args.deltaY ?? 0));
      return JSON.stringify({ ok: true });
    }
    case 'browser_read_dom': {
      const dom = await browser.readDom();
      return JSON.stringify(dom);
    }
    case 'browser_extract': {
      const data = await browser.extractSelector(String(args.selector ?? ''));
      return JSON.stringify(data);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
