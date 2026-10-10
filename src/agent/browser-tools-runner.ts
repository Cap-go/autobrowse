import * as browser from '../browser/browser-controller';
import type { BrowserToolName } from './types';

export async function runBrowserTool(
  name: BrowserToolName,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
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
      return JSON.stringify({ ok: true, base64Preview: base64.slice(0, 120) });
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
