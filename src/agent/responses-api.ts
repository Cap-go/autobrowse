import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { MODELS_API_URL, RESPONSES_API_URL, RESPONSES_MODEL } from '../config';
import { formatApiError } from './errors';
import { BROWSER_TOOL_NAMESPACE, USER_TOOL_NAMESPACE } from './tools';
import type { AgentConversationItem, ToolCallRequest } from './types';

export interface ResponsesApiOptions {
  accessToken: string;
  messages: AgentConversationItem[];
  /** Force a plain answer (no tool calls), used when the step budget is spent. */
  noTools?: boolean;
}

export interface ParsedAssistantTurn {
  responseId: string;
  assistantText: string;
  toolCalls: ToolCallRequest[];
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'completed'; parsed: ParsedAssistantTurn };

const INSTRUCTIONS = [
  'You are Auto Browse, a browsing agent on the user\'s phone. The user watches the browser while you work.',
  'Always act in the browser with your tools instead of answering from memory: open a relevant page',
  '(for searches use https://www.google.com/search?q=...), then call browser_read_dom to read text and',
  'get clickable elements with their x/y centers. Tap using those coordinates. Re-read after each navigation.',
  'Ask the user before payments, purchases, account changes, posting, or sending messages.',
  'When you need a decision, a confirmation or missing information, call ask_user with short options instead of',
  'stopping with a question. For passwords, one-time codes, card numbers or any secret: call request_secret, then',
  'browser_fill_secret. Never ask for secrets in chat, never try to read, guess, repeat or type secret values yourself,',
  'and never fill a secret on a different site than the one it was requested for.',
  'When the user wants data exported, downloaded or saved (CSV, JSON, a list, a table), call export_file with the',
  'complete content, then reply with a one-line summary instead of pasting the data.',
  'When done, answer in a few short lines or bullets. You can use Markdown (lists, tables, code blocks).',
].join(' ');

let cachedModel: { token: string; slug: string } | null = null;

/** Pick a model from the signed-in account's catalog (ChatGPT plans differ). */
export async function resolveModel(accessToken: string): Promise<string> {
  if (cachedModel?.token === accessToken) return cachedModel.slug;
  let slug = RESPONSES_MODEL;
  try {
    const res = await httpRequest(MODELS_API_URL, 'GET', accessToken);
    if (res.status === 200) {
      const body = JSON.parse(res.text) as { models?: Array<{ slug?: string; visibility?: string }> };
      const listed = (body.models ?? []).filter((m) => m.slug && m.visibility === 'list');
      const preferred = listed.find((m) => m.slug === RESPONSES_MODEL) ?? listed[0];
      if (preferred?.slug) slug = preferred.slug;
    }
  } catch {
    /* keep default */
  }
  cachedModel = { token: accessToken, slug };
  return slug;
}

export async function createResponseStream(
  options: ResponsesApiOptions,
): Promise<AsyncIterable<StreamEvent>> {
  const model = await resolveModel(options.accessToken);
  const body = JSON.stringify({
    model,
    input: options.messages,
    instructions: INSTRUCTIONS,
    tools: [BROWSER_TOOL_NAMESPACE, USER_TOOL_NAMESPACE],
    ...(options.noTools ? { tool_choice: 'none' } : {}),
    stream: true,
    store: false,
  });

  if (Capacitor.isNativePlatform()) {
    // The WebView turns some errors (no CORS headers on admission failures)
    // into an opaque "Load failed". Native HTTP returns the real status and
    // body; the SSE text is buffered and parsed once complete.
    const res = await httpRequest(RESPONSES_API_URL, 'POST', options.accessToken, body);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(formatApiError(res.status, res.text));
    }
    const stream = new Response(res.text).body;
    if (!stream) throw new Error('Responses API returned an empty body');
    return parseSseStream(stream);
  }

  const res = await fetch(RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  if (!res.body) throw new Error('Responses API returned an empty body');
  return parseSseStream(res.body);
}

async function httpRequest(
  url: string,
  method: 'GET' | 'POST',
  accessToken: string,
  body?: string,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: body ? JSON.parse(body) : undefined,
      responseType: 'text',
      readTimeout: 180_000,
      connectTimeout: 30_000,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return { status: res.status, text };
  }
  const res = await fetch(url, { method, headers, body });
  return { status: res.status, text: await res.text() };
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
          // With store:false the completed payload can carry an empty output
          // array; fall back to the items collected from the stream.
          const finalOutput = response?.output as unknown[] | undefined;
          const streamed = [...outputItems.entries()]
            .sort(([a], [b]) => a - b).map(([, item]) => item);
          const parsed = parseResponsesJson({
            id: responseId,
            output: finalOutput?.length ? finalOutput : streamed,
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
        namespace: item.namespace ? String(item.namespace) : undefined,
        arguments: JSON.parse(String(item.arguments || '{}')) as Record<string, unknown>,
      });
    }
  }
  return { responseId: String(payload.id ?? ''), assistantText, toolCalls };
}
