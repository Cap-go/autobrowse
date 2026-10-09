import { describe, expect, test } from 'bun:test';
import { parseResponsesJson } from '../src/agent/responses-api';
import { formatApiError, isUsageLimitError } from '../src/agent/errors';
import { createInitialState } from '../src/agent/loop';

describe('agent helpers', () => {
  test('parseResponsesJson extracts text and tool calls', () => {
    const parsed = parseResponsesJson({
      id: 'resp_123',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Opening the page.' }],
        },
        {
          type: 'function_call',
          id: 'call_1',
          name: 'browser_navigate',
          arguments: '{"url":"https://example.com"}',
        },
      ],
    });

    expect(parsed.responseId).toBe('resp_123');
    expect(parsed.assistantText).toContain('Opening');
    expect(parsed.toolCalls[0]?.name).toBe('browser_navigate');
    expect(parsed.toolCalls[0]?.arguments.url).toBe('https://example.com');
  });

  test('createInitialState seeds user message', () => {
    const state = createInitialState('Find flights to NYC');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe('user');
  });

  test('usage limit errors are detected', () => {
    const body = '{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}';
    expect(isUsageLimitError(body)).toBe(true);
    expect(formatApiError(429, body)).toContain('usage limit');
  });
});
