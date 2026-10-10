import { RESPONSES_API_URL, RESPONSES_MODEL } from '../config';
import { formatApiError } from './errors';
import { BROWSER_TOOLS } from './tools';
import type { AgentMessage, ToolCallRequest } from './types';

export interface ResponsesApiOptions {
  accessToken: string;
  messages: AgentMessage[];
  previousResponseId?: string;
}

export interface ParsedAssistantTurn {
  responseId: string;
  assistantText: string;
  toolCalls: ToolCallRequest[];
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'completed'; parsed: ParsedAssistantTurn };

export async function createResponseStream(
  options: ResponsesApiOptions,
): Promise<AsyncIterable<StreamEvent>> {
  const input = options.messages.map((m) => ({
    role: m.role,
    content: [{ type: 'input_text', text: m.content }],
  }));

  const body = {
    model: RESPONSES_MODEL,
    input,
    tools: BROWSER_TOOLS,
    stream: true,
    store: false,
    previous_response_id: options.previousResponseId,
  };

  const res = await fetch(RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiError(res.status, text));
  }

  if (!res.body) {
    throw new Error('Responses API returned an empty body');
  }

  return parseSseStream(res.body);
}

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  const toolCalls = new Map<string, ToolCallRequest>();
  let responseId = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n');
    buffer = chunks.pop() ?? '';

    for (const line of chunks) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = String(event.type ?? '');
      if (type === 'response.created' || type === 'response.in_progress') {
        const response = event.response as { id?: string } | undefined;
        if (response?.id) {
          responseId = response.id;
        }
      }

      if (type === 'response.output_text.delta') {
        const delta = String(event.delta ?? '');
        assistantText += delta;
        yield { type: 'text_delta', delta };
      }

      if (type === 'response.output_item.added') {
        const item = event.item as { type?: string; id?: string; name?: string } | undefined;
        if (item?.type === 'function_call' && item.id && item.name) {
          toolCalls.set(item.id, {
            id: item.id,
            name: item.name as ToolCallRequest['name'],
            arguments: {},
          });
        }
      }

      if (type === 'response.function_call_arguments.delta') {
        const itemId = String(event.item_id ?? '');
        const delta = String(event.delta ?? '');
        const existing = toolCalls.get(itemId);
        if (existing) {
          const raw = (existing.arguments as { __raw?: string }).__raw ?? '';
          (existing.arguments as { __raw?: string }).__raw = raw + delta;
        }
      }

      if (type === 'response.completed') {
        const finalized: ToolCallRequest[] = [];
        for (const call of toolCalls.values()) {
          const raw = (call.arguments as { __raw?: string }).__raw ?? '{}';
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          finalized.push({ ...call, arguments: parsed });
        }
        const response = event.response as { id?: string } | undefined;
        if (response?.id) {
          responseId = response.id;
        }
        yield {
          type: 'completed',
          parsed: {
            responseId,
            assistantText,
            toolCalls: finalized,
          },
        };
      }
    }
  }
}

/** Non-streaming helper for unit tests and deterministic parsing. */
export function parseResponsesJson(payload: Record<string, unknown>): ParsedAssistantTurn {
  const id = String((payload as { id?: string }).id ?? '');
  const output = (payload.output as Array<Record<string, unknown>>) ?? [];
  let assistantText = '';
  const toolCalls: ToolCallRequest[] = [];

  for (const item of output) {
    if (item.type === 'message') {
      const content = (item.content as Array<Record<string, unknown>>) ?? [];
      for (const part of content) {
        if (part.type === 'output_text') {
          assistantText += String(part.text ?? '');
        }
      }
    }
    if (item.type === 'function_call') {
      const argsRaw = String(item.arguments ?? '{}');
      toolCalls.push({
        id: String(item.id ?? ''),
        name: String(item.name ?? '') as ToolCallRequest['name'],
        arguments: JSON.parse(argsRaw) as Record<string, unknown>,
      });
    }
  }

  return { responseId: id, assistantText, toolCalls };
}
