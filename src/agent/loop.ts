import type { OAuthCredentialRecord } from '../auth/types';
import { refreshAccessToken } from '../auth/oauth';
import { runBrowserTool } from './browser-tools-runner';
import { createResponseStream } from './responses-api';
import type { AgentConversationItem, ToolCallResult, ToolOutput } from './types';

export interface AgentLoopState {
  messages: AgentConversationItem[];
  /** @deprecated Conversation items are replayed with store:false instead. */
  previousResponseId?: string;
}

export interface AgentLoopHooks {
  onAssistantDelta?: (delta: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, ok: boolean, summary: string) => void;
  onStepStart?: (step: number) => void;
}

export interface AgentTurnResult {
  assistantText: string;
  state: AgentLoopState;
  toolResults: ToolCallResult[];
}

async function withFreshToken<T>(
  creds: OAuthCredentialRecord,
  fn: (token: string) => Promise<T>,
): Promise<{ value: T; credentials: OAuthCredentialRecord }> {
  let record = creds;
  if (Date.now() >= record.expiresAtMs - 60_000) {
    record = await refreshAccessToken(record);
  }

  try {
    return { value: await fn(record.accessToken), credentials: record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('401') || message.includes('invalid_token')) {
      record = await refreshAccessToken(record);
      return { value: await fn(record.accessToken), credentials: record };
    }
    throw error;
  }
}

export async function runAgentTurn(
  creds: OAuthCredentialRecord,
  state: AgentLoopState,
  hooks?: AgentLoopHooks,
): Promise<AgentTurnResult> {
  const messages = [...state.messages];
  const toolResults: ToolCallResult[] = [];
  let assistantText = '';
  let credentials = creds;

  for (let step = 1; step <= 12; step++) {
    hooks?.onStepStart?.(step);
    const response = await withFreshToken(credentials, async (accessToken) => {
      const stream = await createResponseStream({ accessToken, messages });
      let parsed;
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          hooks?.onAssistantDelta?.(event.delta);
        } else {
          parsed = event.parsed;
        }
      }
      if (!parsed) throw new Error('Responses API stream ended before completion');
      return parsed;
    });
    credentials = response.credentials;
    const turn = response.value;
    assistantText += turn.assistantText;
    if (turn.assistantText) {
      messages.push({ role: 'assistant', content: turn.assistantText });
    }
    if (!turn.toolCalls.length) break;

    // Preserve every call before adding outputs, including parallel tool calls.
    for (const call of turn.toolCalls) {
      messages.push({
        type: 'function_call',
        call_id: call.callId,
        name: call.name,
        ...(call.namespace ? { namespace: call.namespace } : {}),
        arguments: JSON.stringify(call.arguments),
      });
    }
    for (const call of turn.toolCalls) {
      hooks?.onToolStart?.(call.name, call.arguments);
      let output: ToolOutput;
      let ok = true;
      let summary: string;
      try {
        output = await runBrowserTool(call.name, call.arguments);
        summary = typeof output === 'string' ? output.slice(0, 200) : 'Screenshot captured.';
      } catch (error) {
        ok = false;
        summary = error instanceof Error ? error.message : String(error);
        output = JSON.stringify({ ok: false, error: summary });
      }
      messages.push({ type: 'function_call_output', call_id: call.callId, output });
      toolResults.push({ toolCallId: call.callId, output });
      hooks?.onToolEnd?.(call.name, ok, summary);
    }
    if (step === 12) {
      const delta = '\nReached the 12-step limit. Send a message to continue.';
      assistantText += delta;
      messages.push({ role: 'assistant', content: delta.trim() });
      hooks?.onAssistantDelta?.(delta);
    }
  }

  return { assistantText, toolResults, state: { messages } };
}

export function appendUserMessage(state: AgentLoopState, text: string): AgentLoopState {
  return { messages: [...state.messages, { role: 'user', content: text }] };
}

export function createInitialState(userText: string): AgentLoopState {
  return appendUserMessage({ messages: [] }, userText);
}
