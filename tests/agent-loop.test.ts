import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Capacitor } from '@capacitor/core';
import type { OAuthCredentialRecord } from '../src/auth/types';
import type { AgentConversationItem } from '../src/agent/types';
import { formatApiError, isUsageLimitError } from '../src/agent/errors';

const listeners = new Map<string, (event: { id?: string; url: string }) => void>();
const browserPlugin = {
  addListener: mock(async (name: string, listener: (event: { id?: string; url: string }) => void) => {
    listeners.set(name, listener);
    return { remove: async () => {} };
  }),
  openWebView: mock(async () => {
    setTimeout(() => listeners.get('browserPageLoaded')?.({ id: 'webview_1', url: '' }), 0);
    return { id: 'webview_1' };
  }),
  close: mock(async () => {}),
  setUrl: mock(async () => {
    setTimeout(() => listeners.get('browserPageLoaded')?.({ id: 'webview_1', url: '' }), 0);
  }),
  updateDimensions: mock(async () => {}),
  goBack: mock(async () => ({ canGoBack: false })),
  takeScreenshot: mock(async () => ({ base64: 'c2NyZWVuc2hvdA==' })),
  dispatchInputEvent: mock(async () => {}),
  executeScript: mock(async (_opts?: { code: string }) => {}),
};
mock.module('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: browserPlugin,
  ToolBarType: { NAVIGATION: 'navigation', BLANK: 'blank', COMPACT: 'compact' },
}));

const { parseResponsesJson, createResponseStream } = await import('../src/agent/responses-api');
const { appendUserMessage, createInitialState, runAgentTurn } = await import('../src/agent/loop');
const { defaultTab: browser, BrowserTab } = await import('../src/browser/browser-controller');
const oauth = await import('../src/auth/oauth');

const creds: OAuthCredentialRecord = {
  email: '', issuer: '', subject: '', clientId: '', extAgentHostId: '', idToken: '',
  accessToken: 'test-token', refreshToken: '', tokenType: 'Bearer', scopes: [],
  expiresAtMs: Date.now() + 3_600_000, savedAtMs: Date.now(),
};
const call = (suffix: string, name = 'browser_navigate', args: Record<string, unknown> = { url: 'https://example.com' }) => ({
  type: 'function_call', id: `fc_${suffix}`, call_id: `call_${suffix}`, name,
  arguments: JSON.stringify(args),
});
const message = (text: string) => ({
  type: 'message', role: 'assistant', content: [{ type: 'output_text', text }],
});
const completed = (output: unknown[]) => ({
  type: 'response.completed', response: { id: 'resp_123', output },
});
function sse(events: unknown[], chunkSize = 17): Response {
  // Include CRLF and leave the last event without a newline to exercise stream boundaries.
  const bytes = new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}`).join('\r\n\r\n'));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  }));
}
interface RequestBody {
  input: AgentConversationItem[];
  instructions: string;
  store: boolean;
  previous_response_id?: string;
}
const fetchSpy = spyOn(globalThis, 'fetch');
const requests: RequestBody[] = [];
let responses: Response[] = [];
beforeEach(async () => {
  await browser.close();
  requests.length = 0;
  responses = [];
  for (const fn of Object.values(browserPlugin)) fn.mockClear();
  fetchSpy.mockImplementation(Object.assign(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)) as RequestBody);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected model request');
    return response;
  }, { preconnect: () => {} }));
});
afterEach(async () => {
  await browser.close();
});
afterAll(() => fetchSpy.mockRestore());

describe('agent helpers', () => {
  test('JSON parser records distinct item id and call_id', () => {
    const parsed = parseResponsesJson({ id: 'resp_123', output: [message('Opening the page.'), call('1')] });
    expect(parsed.responseId).toBe('resp_123');
    expect(parsed.assistantText).toBe('Opening the page.');
    expect(parsed.toolCalls[0]).toEqual({
      id: 'fc_1', callId: 'call_1', name: 'browser_navigate', arguments: { url: 'https://example.com' },
    });
  });

  test('initial state and appendUserMessage preserve history without mutating it', () => {
    const state = createInitialState('Find flights');
    const next = appendUserMessage(state, 'To NYC');
    expect(state.messages).toEqual([{ role: 'user', content: 'Find flights' }]);
    expect(next.messages).toEqual([...state.messages, { role: 'user', content: 'To NYC' }]);
    next.messages.push({ role: 'user', content: 'Tomorrow' });
    expect(state.messages).toHaveLength(1);
  });

  test('usage limit errors are detected', () => {
    const body = '{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}';
    expect(isUsageLimitError(body)).toBe(true);
    expect(formatApiError(429, body)).toContain('usage limit');
  });
});

describe('Responses streaming', () => {
  test('done item arguments override deltas and preserve call_id', async () => {
    responses.push(sse([
      { type: 'response.output_item.added', output_index: 0, item: { ...call('1'), arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"url":"wrong"}' },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: call('1').arguments },
      { type: 'response.output_item.done', output_index: 0, item: call('1') },
      { type: 'response.completed', response: { id: 'resp_done' } },
    ]));
    const events = [];
    for await (const event of await createResponseStream({ accessToken: 'token', messages: [] })) events.push(event);
    expect(events).toEqual([{ type: 'completed', parsed: {
      responseId: 'resp_done', assistantText: '', toolCalls: [{
        id: 'fc_1', callId: 'call_1', name: 'browser_navigate', arguments: { url: 'https://example.com' },
      }],
    } }]);
  });

  test('empty completed output falls back to streamed tool calls', async () => {
    responses.push(sse([
      { type: 'response.output_item.done', output_index: 0, item: call('1') },
      { type: 'response.completed', response: { id: 'resp_empty', output: [] } },
    ]));
    const events = [];
    for await (const event of await createResponseStream({ accessToken: 'token', messages: [] })) events.push(event);
    const done = events[0] as { type: 'completed'; parsed: { toolCalls: unknown[] } };
    expect(done.parsed.toolCalls).toHaveLength(1);
  });

  test('completed payload supplies tool calls and final text without added events', async () => {
    responses.push(sse([completed([message('Ready 🌍'), call('final')])], 1));
    const events = [];
    for await (const event of await createResponseStream({ accessToken: 'token', messages: [] })) events.push(event);
    expect(events[0]).toMatchObject({ type: 'completed', parsed: {
      assistantText: 'Ready 🌍', toolCalls: [{ id: 'fc_final', callId: 'call_final' }],
    } });
  });

  test('truncated and failed streams throw instead of returning successful turns', async () => {
    for (const events of [[], [{ type: 'response.failed', response: { error: { message: 'Model failed' } } }]]) {
      responses.push(sse(events));
      await expect((async () => {
        for await (const event of await createResponseStream({ accessToken: 'token', messages: [] })) void event;
      })()).rejects.toThrow();
    }
  });
});

describe('agent loop', () => {
  test('replays full call/output history, loops, streams hooks, and supports follow-up turns', async () => {
    responses.push(
      sse([{ type: 'response.output_text.delta', delta: 'Opening.' }, completed([message('Opening.'), call('1')])]),
      sse([completed([call('2', 'browser_scroll', { deltaY: 200 })])]),
      sse([completed([message('Done.')])]),
      sse([completed([message('Follow-up answer.')])]),
    );
    const onAssistantDelta = mock((_delta: string) => {});
    const onToolStart = mock((_name: string, _args: Record<string, unknown>) => {});
    const onToolEnd = mock((_name: string, _ok: boolean, _summary: string) => {});
    const onStepStart = mock((_step: number) => {});
    const initial = { ...createInitialState('Browse'), previousResponseId: 'old_response' };
    const result = await runAgentTurn(creds, initial, { onAssistantDelta, onToolStart, onToolEnd, onStepStart });
    expect(requests[1]?.input).toEqual([
      { role: 'user', content: 'Browse' }, { role: 'assistant', content: 'Opening.' },
      { type: 'function_call', call_id: 'call_1', name: 'browser_navigate', arguments: '{"url":"https://example.com"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true,"url":"https://example.com"}' },
    ]);
    expect(requests[2]?.input.slice(-2)).toEqual([
      { type: 'function_call', call_id: 'call_2', name: 'browser_scroll', arguments: '{"deltaY":200}' },
      { type: 'function_call_output', call_id: 'call_2', output: '{"ok":true}' },
    ]);
    expect(result.assistantText).toBe('Opening.Done.');
    expect(result.toolResults.map((result) => result.toolCallId)).toEqual(['call_1', 'call_2']);
    expect(initial.messages).toHaveLength(1);
    expect(onAssistantDelta).toHaveBeenCalledWith('Opening.');
    expect(onToolStart).toHaveBeenCalledWith('browser_navigate', { url: 'https://example.com' });
    expect(onToolEnd).toHaveBeenCalledWith('browser_scroll', true, '{"ok":true}');
    expect(onStepStart.mock.calls.map(([step]) => step)).toEqual([1, 2, 3]);
    await runAgentTurn(creds, appendUserMessage(result.state, 'More'));
    expect(requests[3]?.input).toEqual([...result.state.messages, { role: 'user', content: 'More' }]);
    for (const request of requests) {
      expect(request.store).toBe(false);
      expect(request).not.toHaveProperty('previous_response_id');
      expect(request.instructions).toContain('Auto Browse');
      expect(request.instructions).toContain('Ask the user');
    }
  });

  test('tool errors are sent to the model and remaining tools still run', async () => {
    responses.push(sse([completed([call('bad', 'browser_navigate', { url: 'http://example.com' }), call('good')])]),
      sse([completed([message('Recovered.')])]));
    const onToolEnd = mock((_name: string, _ok: boolean, _summary: string) => {});
    const result = await runAgentTurn(creds, createInitialState('Browse'), { onToolEnd });
    expect(result.assistantText).toBe('Recovered.');
    expect(requests[1]?.input.slice(-2)).toEqual([
      { type: 'function_call_output', call_id: 'call_bad', output: '{"ok":false,"error":"Only https URLs are allowed"}' },
      { type: 'function_call_output', call_id: 'call_good', output: '{"ok":true,"url":"https://example.com"}' },
    ]);
    expect(onToolEnd).toHaveBeenCalledWith('browser_navigate', false, 'Only https URLs are allowed');
  });

  test('screenshots are sent as images in function outputs', async () => {
    responses.push(sse([completed([call('open')])]),
      sse([completed([call('shot', 'browser_screenshot', {})])]),
      sse([completed([message('I can see the page.')])]));
    await runAgentTurn(creds, createInitialState('See page'));
    const last = requests[2]?.input.at(-1) as { type: string; call_id: string; output: Array<Record<string, string>> };
    expect(last.type).toBe('function_call_output');
    expect(last.call_id).toBe('call_shot');
    expect(JSON.parse(String(last.output[0]?.text)).ok).toBe(true);
    expect(last.output[1]).toEqual({
      type: 'input_image', image_url: 'data:image/png;base64,c2NyZWVuc2hvdA==', detail: 'auto',
    });
  });

  test('an authentication retry repeats only the model request, preserving completed tools', async () => {
    responses.push(sse([completed([call('open')])]),
      new Response('{"error":{"message":"invalid_token"}}', { status: 401 }),
      sse([completed([message('Done.')])]));
    const refresh = spyOn(oauth, 'refreshAccessToken').mockResolvedValue({
      ...creds, accessToken: 'refreshed-test-token',
    });
    try {
      const result = await runAgentTurn(creds, createInitialState('Browse'));
      expect(result.assistantText).toBe('Done.');
      expect(result.toolResults).toHaveLength(1);
      expect(browserPlugin.openWebView).toHaveBeenCalledTimes(1);
      expect(requests[2]?.input).toEqual(requests[1]?.input);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer refreshed-test-token',
      });
    } finally {
      refresh.mockRestore();
    }
  });

  test('after the tool budget asks once more without tools and returns that answer', async () => {
    const { MAX_TOOL_STEPS } = await import('../src/agent/loop');
    responses.push(...Array.from({ length: MAX_TOOL_STEPS }, (_, i) => sse([completed([call(String(i))])])));
    responses.push(sse([completed([message('Here is what I found.')])]));
    const result = await runAgentTurn(creds, createInitialState('Loop'));
    expect(requests).toHaveLength(MAX_TOOL_STEPS + 1);
    expect((requests.at(-1) as unknown as { tool_choice?: string }).tool_choice).toBe('none');
    expect(result.toolResults).toHaveLength(MAX_TOOL_STEPS);
    expect(result.assistantText).toContain('Here is what I found.');
    expect(result.state.messages.some((m) => 'role' in m && m.role === 'developer')).toBe(false);
  });

  test('shouldStop ends the turn before the next model step', async () => {
    responses.push(sse([completed([call('a')])]), sse([completed([message('never')])]));
    let calls = 0;
    const result = await runAgentTurn(creds, createInitialState('Stop'), { shouldStop: () => ++calls > 1 });
    expect(requests).toHaveLength(1);
    expect(result.assistantText).not.toContain('never');
  });

  test('stopping between parallel tools skips the rest but answers every call', async () => {
    responses.push(sse([completed([call('a', 'browser_scroll', { deltaY: 100 }), call('b', 'browser_scroll', { deltaY: 200 })])]));
    let stop = false;
    const checkpoints: number[] = [];
    const result = await runAgentTurn(creds, createInitialState('Two'), {
      shouldStop: () => stop,
      onToolEnd: () => {
        stop = true;
      },
      onCheckpoint: (state) => checkpoints.push(state.messages.length),
    });
    expect(requests).toHaveLength(1);
    const outputs = result.state.messages.filter((m) => 'type' in m && m.type === 'function_call_output');
    expect(outputs).toHaveLength(2);
    expect(JSON.stringify(outputs[1])).toContain('Stopped by the user');
    expect(checkpoints.length).toBeGreaterThan(0);
  });

  test('aborting drops the model request in flight', async () => {
    const controller = new AbortController();
    fetchSpy.mockImplementationOnce(Object.assign(() => new Promise<Response>(() => undefined), { preconnect: () => undefined }) as unknown as typeof fetch);
    const run = runAgentTurn(creds, createInitialState('Hang'), { signal: controller.signal });
    // Abort once the request is in flight.
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(run).rejects.toThrow('Stopped.');
  });
});

describe('browser lifecycle', () => {
  test('older native builds without BrowserLayout keep the original viewport coordinates', async () => {
    const native = spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const available = spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);
    const tab = new BrowserTab();
    try {
      await tab.setFrame({ x: 12, y: 54, width: 320, height: 300 });
      await tab.open('https://example.com');
      expect(browserPlugin.openWebView).toHaveBeenLastCalledWith(expect.objectContaining({ x: 12, y: 54, width: 320, height: 300 }));
    } finally {
      await tab.close();
      native.mockRestore();
      available.mockRestore();
    }
  });

  test('navigate opens the browser, reuses it, and close clears it', async () => {
    expect(browser.isOpen).toBe(false);
    await browser.navigate('https://example.com');
    expect(browser.isOpen).toBe(true);
    expect(browserPlugin.openWebView).toHaveBeenCalledTimes(1);
    await browser.navigate('https://example.com/next');
    expect(browserPlugin.setUrl).toHaveBeenCalledWith({ url: 'https://example.com/next', id: 'webview_1' });
    await browser.close();
    expect(browserPlugin.close).toHaveBeenCalledWith({ id: 'webview_1' });
    expect(browser.isOpen).toBe(false);
  });

  test('listeners are registered once and close events only clear the matching browser', async () => {
    await browser.open('https://example.com');
    const urlListener = listeners.get('urlChangeEvent');
    browserPlugin.addListener.mockClear();
    await browser.close();
    await browser.open('https://example.com');
    // Only per-script message listeners (e.g. title refresh) may be added; lifecycle ones are not re-registered.
    const names = browserPlugin.addListener.mock.calls.map(([name]) => name);
    expect(names.filter((name) => name !== 'messageFromWebview')).toEqual([]);
    expect(listeners.get('urlChangeEvent')).toBe(urlListener);
    listeners.get('closeEvent')?.({ id: 'unrelated', url: '' });
    expect(browser.isOpen).toBe(true);
    listeners.get('closeEvent')?.({ id: 'webview_1', url: '' });
    expect(browser.isOpen).toBe(false);
  });

  test('Back reports whether native history navigation succeeded', async () => {
    await browser.open('https://example.com');
    browserPlugin.goBack.mockResolvedValueOnce({ canGoBack: true });
    expect(await browser.goBack()).toBe(true);
    browserPlugin.goBack.mockResolvedValueOnce({ canGoBack: false });
    expect(await browser.goBack()).toBe(false);
    await browser.close();
    expect(browser.url).toBeNull();
    expect(browser.title).toBe('');
  });

  test('all page tools give a clear error while the browser is closed', async () => {
    const error = 'Browser is not open. Navigate to a page first.';
    const operations = [
      () => browser.goBack(), () => browser.takeScreenshot(), () => browser.clickAt(1, 2),
      () => browser.scrollBy(0, 200), () => browser.typeText('text', 1, 2),
      () => browser.readDom(), () => browser.extractSelector('body'), () => browser.getSnapshot(),
    ];
    for (const operation of operations) await expect(operation()).rejects.toThrow(error);
    expect(browserPlugin.executeScript).not.toHaveBeenCalled();
    expect(browserPlugin.dispatchInputEvent).not.toHaveBeenCalled();
  });
});

describe('namespaced tool calls', () => {
  test('parseResponsesJson keeps the tool namespace', () => {
    const parsed = parseResponsesJson({
      id: 'resp_ns',
      output: [
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_ns',
          name: 'browser_read_dom',
          namespace: 'capgo_browser',
          arguments: '{}',
        },
      ],
    });
    expect(parsed.toolCalls[0]?.namespace).toBe('capgo_browser');
  });
});

describe('history compaction', () => {
  test('keeps only the latest screenshot and trims old outputs', async () => {
    const { compactHistory } = await import('../src/agent/loop');
    const big = 'x'.repeat(5000);
    const shot = (id: string) => ({
      type: 'function_call_output' as const, call_id: id,
      output: [{ type: 'input_text' as const, text: '{"ok":true}' }, { type: 'input_image' as const, image_url: 'data:x', detail: 'auto' as const }],
    });
    const text = (id: string) => ({ type: 'function_call_output' as const, call_id: id, output: big });
    const items = [shot('s1'), text('t1'), text('t2'), text('t3'), text('t4'), text('t5'), shot('s2')];
    const out = compactHistory(items) as Array<{ output: unknown }>;
    expect(typeof out[0]?.output).toBe('string');
    expect(String(out[1]?.output).length).toBeLessThan(1000);
    expect(out[5]?.output).toBe(big);
    expect(Array.isArray(out[6]?.output)).toBe(true);
  });
});

describe('lifecycle', () => {
  test('the agent waits while the app is in the background and resumes after', async () => {
    const lifecycle = await import('../src/agent/lifecycle');
    lifecycle.setAppActive(false);
    responses.push(sse([completed([message('Back again.')])]));
    let done = false;
    const run = runAgentTurn(creds, createInitialState('Pause test')).then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(done).toBe(false);
    expect(requests).toHaveLength(0);
    lifecycle.setAppActive(true);
    const result = await run;
    expect(result.assistantText).toContain('Back again.');
  });
});

describe('secrets and questions', () => {
  test('request_secret + browser_fill_secret never send the value to the model', async () => {
    const { vault } = await import('../src/secrets/vault');
    const SECRET = 'S3cret-Passw0rd!';
    const scripts: string[] = [];
    browserPlugin.executeScript.mockImplementation(async (opts?: { code: string }) => {
      const code = opts?.code ?? '';
      scripts.push(code);
      const channel = code.match(/capgo-dom-[0-9a-f-]+/)?.[0];
      if (channel) {
        // Simulate a page that echoes the typed value back in its text.
        setTimeout(() => listeners.get('messageFromWebview')?.({
          detail: { channel, payload: { filled: true, field: `password ${SECRET}` } },
        } as never), 0);
      }
    });
    responses.push(
      sse([completed([call('nav', 'browser_navigate', { url: 'https://github.com/login' })])]),
      sse([completed([call('ask', 'request_secret', { name: 'github_password', label: 'GitHub password', kind: 'password' })])]),
      sse([completed([call('fill', 'browser_fill_secret', { secret: 'secret:github_password', x: 10, y: 20 })])]),
      sse([completed([message('Signed in.')])]),
    );
    const result = await runAgentTurn(creds, createInitialState('Log me in'), {
      requestSecret: async (req) => {
        await vault.save({ ...req, value: SECRET, remember: false });
        return { provided: true };
      },
    });
    browserPlugin.executeScript.mockImplementation(async () => {});
    expect(result.assistantText).toContain('Signed in.');
    expect(scripts.some((code) => code.includes(SECRET))).toBe(true);
    expect(JSON.stringify(requests)).not.toContain(SECRET);
    expect(JSON.stringify(requests)).toContain('secret:github_password');
  });

  test('a secret cannot be filled on another site', async () => {
    const { vault } = await import('../src/secrets/vault');
    await vault.save({ name: 'bank_pin', label: 'Bank PIN', domain: 'mybank.com', kind: 'password', value: '9876', remember: false });
    responses.push(
      sse([completed([call('nav', 'browser_navigate', { url: 'https://evil.example/login' })])]),
      sse([completed([call('fill', 'browser_fill_secret', { secret: 'bank_pin', x: 1, y: 1 })])]),
      sse([completed([message('Could not fill.')])]),
    );
    await runAgentTurn(creds, createInitialState('fill'));
    const output = JSON.stringify(requests.at(-1)?.input.at(-1));
    expect(output).toContain('belongs to mybank.com');
    expect(JSON.stringify(requests)).not.toContain('9876');
  });

  test('ask_user returns the chosen answer or a skip', async () => {
    responses.push(
      sse([completed([call('q', 'ask_user', { question: 'Which size?', options: ['27"', '32"'] })])]),
      sse([completed([message('Ok.')])]),
    );
    await runAgentTurn(creds, createInitialState('buy'), {
      askUser: async (req) => ({ answer: req.options[1] ?? null }),
    });
    expect(JSON.stringify(requests.at(-1)?.input.at(-1))).toContain('32\\\\\\"');
  });
});

describe('export_file', () => {
  test('hands the file to the UI and redacts secrets inside it', async () => {
    const { vault } = await import('../src/secrets/vault');
    await vault.save({ name: 'api_key', label: 'API key', domain: 'example.com', kind: 'text', value: 'sk-SECRET-123', remember: false });
    const files: Array<{ filename: string; content: string }> = [];
    responses.push(
      sse([completed([call('f', 'export_file', { filename: 'products.csv', content: 'name,price\nShoe,275\nkey,sk-SECRET-123' })])]),
      sse([completed([message('Exported 2 products.')])]),
    );
    await runAgentTurn(creds, createInitialState('export'), { exportFile: (file) => files.push(file) });
    expect(files[0]?.filename).toBe('products.csv');
    expect(files[0]?.content).toContain('Shoe,275');
    expect(files[0]?.content).not.toContain('sk-SECRET-123');
    expect(JSON.stringify(requests.at(-1)?.input.at(-1))).toContain('"ok\\":true');
  });
});

describe('native plugin contract', () => {
  test('openWebView options are accepted by the iOS plugin', async () => {
    await browser.open('https://example.com');
    const options = (browserPlugin.openWebView.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0];
    // InAppBrowserPlugin.swift rejects preShowScript unless isPresentAfterPageLoad is true.
    if (options.preShowScript) expect(options.isPresentAfterPageLoad).toBe(true);
    expect(options.preventDeeplink).toBe(true);
    expect(String(options.url)).toBe('https://example.com');
  });

  test('the link guard is injected after a page load', async () => {
    browserPlugin.executeScript.mockClear();
    await browser.open('https://example.com/guard');
    await new Promise((r) => setTimeout(r, 10));
    const codes = browserPlugin.executeScript.mock.calls.map((c) => String((c as unknown as [{ code: string }])[0]?.code));
    expect(codes.some((code) => code.includes('__autoBrowseLinkGuard'))).toBe(true);
  });
});

describe('in-page chat pill', () => {
  test('setPill injects, skips identical updates and removes', async () => {
    await browser.open('https://example.com/pill');
    browserPlugin.executeScript.mockClear();
    const state = { label: 'Thinking…', busy: true, unread: false, bottom: 44 };
    await browser.setPill(state);
    await browser.setPill({ ...state });
    expect(browserPlugin.executeScript).toHaveBeenCalledTimes(1);
    expect(String((browserPlugin.executeScript.mock.calls[0] as unknown as [{ code: string }])[0].code)).toContain('__autobrowse_pill');
    await browser.setPill(null);
    expect(browserPlugin.executeScript).toHaveBeenCalledTimes(2);
  });
});
