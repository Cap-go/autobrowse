import { RESPONSES_API_URL, RESPONSES_MODEL } from '../config';
import { formatApiError } from './errors';
import { BROWSER_TOOLS } from './tools';
import type { AgentConversationItem, ToolCallRequest } from './types';

export interface ResponsesApiOptions {
  accessToken: string;
  messages: AgentConversationItem[];
}

export interface ParsedAssistantTurn {
  responseId: string;
  assistantText: string;
  toolCalls: ToolCallRequest[];
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'completed'; parsed: ParsedAssistantTurn };

const INSTRUCTIONS = 'You are Capgo Browser, a mobile browsing agent. Use the browser tools ' +
  'to browse and read the page before clicking. Ask the user before submitting payments, ' +
  'making purchases, making account changes, or sending messages. Keep replies short.';

export async function createResponseStream(
  options: ResponsesApiOptions,
): Promise<AsyncIterable<StreamEvent>> {
  const res = await fetch(RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: RESPONSES_MODEL,
      input: options.messages,
      instructions: INSTRUCTIONS,
      tools: BROWSER_TOOLS,
      stream: true,
      store: false,
    }),
  });

  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  if (!res.body) throw new Error('Responses API returned an empty body');
  return parseSseStream(res.body);
}

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  const outputItems = new Map<number, Record<string, unknown>>();
  let responseId = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      if (done && buffer) lines.push(buffer);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const event = JSON.parse(payload) as Record<string, unknown>;
        const type = event.type;
        const response = event.response as Record<string, unknown> | undefined;
        if (response?.id) responseId = String(response.id);

        if (type === 'response.output_text.delta') {
          const delta = String(event.delta ?? '');
          assistantText += delta;
          yield { type: 'text_delta', delta };
        }
        if (type === 'response.output_item.added' || type === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (item) outputItems.set(Number(event.output_index), { ...item });
        }
        if (type === 'response.function_call_arguments.delta' ||
            type === 'response.function_call_arguments.done') {
          const item = [...outputItems.values()].find((item) => item.id === event.item_id);
          if (item) {
            item.arguments = type.endsWith('.done') ? event.arguments :
              String(item.arguments ?? '') + String(event.delta ?? '');
          }
        }
        if (type === 'error' || type === 'response.failed' || type === 'response.incomplete') {
          const error = (response?.error ?? event.error ?? event) as { message?: string };
          throw new Error(error.message ?? `Responses API stream: ${type}`);
        }
        if (type === 'response.completed') {
          // The final payload is authoritative; done items cover streams without output here.
          const parsed = parseResponsesJson({
            id: responseId,
            output: response?.output ?? [...outputItems.entries()]
              .sort(([a], [b]) => a - b).map(([, item]) => item),
          });
          if (!parsed.assistantText) parsed.assistantText = assistantText;
          yield { type: 'completed', parsed };
          return;
        }
      }
      if (done) throw new Error('Responses API stream ended before completion');
    }
  } finally {
    reader.releaseLock();
  }
}

/** Non-streaming helper for unit tests and deterministic parsing. */
export function parseResponsesJson(payload: Record<string, unknown>): ParsedAssistantTurn {
  const output = (payload.output as Array<Record<string, unknown>>) ?? [];
  let assistantText = '';
  const toolCalls: ToolCallRequest[] = [];

  for (const item of output) {
    if (item.type === 'message') {
      const content = (item.content as Array<Record<string, unknown>>) ?? [];
      for (const part of content) {
        if (part.type === 'output_text') assistantText += String(part.text ?? '');
      }
    }
    if (item.type === 'function_call') {
      if (!item.call_id) throw new Error('Responses API function call is missing call_id');
      toolCalls.push({
        id: String(item.id ?? ''),
        callId: String(item.call_id),
        name: String(item.name ?? '') as ToolCallRequest['name'],
        arguments: JSON.parse(String(item.arguments || '{}')) as Record<string, unknown>,
      });
    }
  }
  return { responseId: String(payload.id ?? ''), assistantText, toolCalls };
}
