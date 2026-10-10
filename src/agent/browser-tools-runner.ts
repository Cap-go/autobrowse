import * as browser from '../browser/browser-controller';
import type { BrowserToolName, ToolOutput } from './types';

export async function runBrowserTool(
  name: BrowserToolName,
  args: Record<string, unknown>,
): Promise<ToolOutput> {
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
      return [
        { type: 'input_text', text: JSON.stringify({ ok: true }) },
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
