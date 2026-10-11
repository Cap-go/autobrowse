import { describe, expect, test } from 'bun:test';
import { parseDeepLink } from '../src/deeplink';

describe('parseDeepLink', () => {
  test('custom scheme run with prompt and url', () => {
    const link = parseDeepLink('autobrowse://run?prompt=Summarize%20this&url=https%3A%2F%2Fexample.com%2Fa');
    expect(link).toEqual({ action: 'run', prompt: 'Summarize this', url: 'https://example.com/a', tab: 'new' });
  });

  test('universal link run and open', () => {
    expect(parseDeepLink('https://capgo.app/autobrowse/run/?prompt=hi&tab=current')).toEqual({
      action: 'run', prompt: 'hi', url: undefined, tab: 'current',
    });
    expect(parseDeepLink('https://capgo.app/autobrowse/open?url=https://news.ycombinator.com')?.url).toBe(
      'https://news.ycombinator.com/',
    );
  });

  test('rejects unsafe or unrelated links', () => {
    expect(parseDeepLink('autobrowse://open?url=javascript:alert(1)')).toBeNull();
    expect(parseDeepLink('autobrowse://open?url=http://insecure.example')).toBeNull();
    expect(parseDeepLink('https://evil.example/autobrowse/run?prompt=x')).toBeNull();
    expect(parseDeepLink('autobrowse://delete?prompt=x')).toBeNull();
    expect(parseDeepLink('autobrowse://run')).toBeNull();
  });

  test('drops non-https url but keeps prompt, and caps prompt length', () => {
    const link = parseDeepLink(`autobrowse://run?prompt=${'a'.repeat(3000)}&url=file:///etc/passwd`);
    expect(link?.url).toBeUndefined();
    expect(link?.prompt).toHaveLength(2000);
  });
});
