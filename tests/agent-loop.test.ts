import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
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
  goBack: mock(async () => {}),
  takeScreenshot: mock(async () => ({ base64: 'c2NyZWVuc2hvdA==' })),
  dispatchInputEvent: mock(async () => {}),
  executeScript: mock(async () => {}),
};
mock.module('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: browserPlugin,
  ToolBarType: { NAVIGATION: 'navigation', BLANK: 'blank', COMPACT: 'compact' },
}));

const { parseResponsesJson, createResponseStream } = await import('../src/agent/responses-api');
const { appendUserMessage, createInitialState, runAgentTurn } = await import('../src/agent/loop');
const browser = await import('../src/browser/browser-controller');
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
  await browser.closeBrowser();
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
  await browser.closeBrowser();
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
      expect(request.instructions).toContain('Capgo Browser');
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

  test('stops at 12 model steps while preserving every tool output', async () => {
    responses.push(...Array.from({ length: 12 }, (_, i) => sse([completed([call(String(i))])])));
    const result = await runAgentTurn(creds, createInitialState('Keep browsing'));
    expect(requests).toHaveLength(12);
    expect(result.toolResults).toHaveLength(12);
    expect(result.state.messages.filter((item) => 'type' in item && item.type === 'function_call_output')).toHaveLength(12);
    expect(result.assistantText).toContain('12-step limit');
  });
});

describe('browser lifecycle', () => {
  test('navigate opens the browser, reuses it, and close clears it', async () => {
    expect(browser.isBrowserOpen()).toBe(false);
    await browser.navigate('https://example.com');
    expect(browser.isBrowserOpen()).toBe(true);
    expect(browserPlugin.openWebView).toHaveBeenCalledTimes(1);
    await browser.navigate('https://example.com/next');
    expect(browserPlugin.setUrl).toHaveBeenCalledWith({ url: 'https://example.com/next', id: 'webview_1' });
    await browser.closeBrowser();
    expect(browserPlugin.close).toHaveBeenCalledWith({ id: 'webview_1' });
    expect(browser.isBrowserOpen()).toBe(false);
  });

  test('listeners are registered once and close events only clear the matching browser', async () => {
    await browser.openBrowser('https://example.com');
    const urlListener = listeners.get('urlChangeEvent');
    browserPlugin.addListener.mockClear();
    await browser.closeBrowser();
    await browser.openBrowser('https://example.com');
    expect(browserPlugin.addListener).not.toHaveBeenCalled();
    expect(listeners.get('urlChangeEvent')).toBe(urlListener);
    listeners.get('closeEvent')?.({ id: 'unrelated', url: '' });
    expect(browser.isBrowserOpen()).toBe(true);
    listeners.get('closeEvent')?.({ id: 'webview_1', url: '' });
    expect(browser.isBrowserOpen()).toBe(false);
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
