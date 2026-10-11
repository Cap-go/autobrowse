import type { OAuthCredentialRecord } from '../auth/types';
import { type BrowserTab, defaultTab } from '../browser/browser-controller';
import { refreshAccessToken } from '../auth/oauth';
import { runBrowserTool, type UserToolHandlers } from './browser-tools-runner';
import { vault } from '../secrets/vault';
import { isAppActive, whenActive } from './lifecycle';
import { createResponseStream } from './responses-api';
import type { AgentConversationItem, ToolCallResult, ToolOutput } from './types';

export interface AgentLoopState {
  messages: AgentConversationItem[];
  /** @deprecated Conversation items are replayed with store:false instead. */
  previousResponseId?: string;
}

export interface AgentLoopHooks {
  onAssistantDelta?: (delta: string) => void;
  /** Polled before each model step; return true to stop early. */
  shouldStop?: () => boolean;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, ok: boolean, summary: string) => void;
  onStepStart?: (step: number) => void;
  /** Cards for ask_user / request_secret. */
  askUser?: UserToolHandlers['askUser'];
  requestSecret?: UserToolHandlers['requestSecret'];
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

/** Secrets must never reach the model, even if a page echoes them back. */
function redactOutput(output: ToolOutput): ToolOutput {
  if (typeof output === 'string') return vault.redact(output);
  return output.map((part) => (part.type === 'input_text' ? { ...part, text: vault.redact(part.text) } : part));
}

/** Keep this many most recent tool outputs in full; older ones are trimmed. */
const FULL_OUTPUTS = 4;
const TRIMMED_OUTPUT_CHARS = 800;

/**
 * Every step resends the whole history (store:false), so screenshots and page
 * dumps pile up and long tasks hit request-size/network limits. Keep only the
 * latest screenshot image and trim older tool outputs.
 */
export function compactHistory(items: AgentConversationItem[]): AgentConversationItem[] {
  const outputIndexes = items
    .map((item, index) => ('type' in item && item.type === 'function_call_output' ? index : -1))
    .filter((index) => index >= 0);
  const keepFull = new Set(outputIndexes.slice(-FULL_OUTPUTS));
  let lastImage = -1;
  for (const index of outputIndexes) {
    const item = items[index] as { output: ToolOutput };
    if (Array.isArray(item.output) && item.output.some((part) => part.type === 'input_image')) lastImage = index;
  }
  return items.map((item, index) => {
    if (!('type' in item) || item.type !== 'function_call_output') return item;
    if (Array.isArray(item.output)) {
      if (index === lastImage) return item;
      const text = item.output.filter((part) => part.type === 'input_text').map((part) => part.text).join(' ');
      return { ...item, output: `${text} [older screenshot removed]`.trim() };
    }
    if (keepFull.has(index) || item.output.length <= TRIMMED_OUTPUT_CHARS) return item;
    return { ...item, output: `${item.output.slice(0, TRIMMED_OUTPUT_CHARS)}… [trimmed]` };
  });
}

const NETWORK_ERROR = /load failed|network connection was lost|timed out|timeout|failed to fetch|socket|ECONNRESET/i;

async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    await whenActive();
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A request cut by backgrounding/locking is retried once the app is back.
      const interrupted = !isAppActive();
      if (!NETWORK_ERROR.test(message) && !interrupted) throw error;
      attempt += 1;
      if (attempt > 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
  }
}

/** Tool-using steps per user message before the agent must answer. */
export const MAX_TOOL_STEPS = 40;

export async function runAgentTurn(
  creds: OAuthCredentialRecord,
  state: AgentLoopState,
  hooks?: AgentLoopHooks,
  tab: BrowserTab = defaultTab,
): Promise<AgentTurnResult> {
  const messages = [...state.messages];
  const toolResults: ToolCallResult[] = [];
  let assistantText = '';
  let credentials = creds;

  let budgetSpent = false;
  for (let step = 1; step <= MAX_TOOL_STEPS + 1; step++) {
    await whenActive();
    if (hooks?.shouldStop?.()) break;
    // After the tool budget, ask once more with tools disabled so the user
    // always gets an answer built from what was found.
    const finalAnswer = step > MAX_TOOL_STEPS;
    if (finalAnswer) {
      budgetSpent = true;
      messages.push({
        role: 'developer',
        content: 'You have used your browsing budget for this request. Answer the user now with what you found, and say what is left to check.',
      });
    }
    hooks?.onStepStart?.(step);
    const response = await withFreshToken(credentials, async (accessToken) => {
      const stream = await withNetworkRetry(() =>
        createResponseStream({ accessToken, messages: compactHistory(messages), noTools: finalAnswer }),
      );
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
    if (!turn.toolCalls.length || finalAnswer) break;

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
      // Browser actions need the app in the foreground.
      await whenActive();
      hooks?.onToolStart?.(call.name, call.arguments);
      let output: ToolOutput;
      let ok = true;
      let summary: string;
      try {
        output = redactOutput(
          await runBrowserTool(call.name, call.arguments, tab, {
            askUser: hooks?.askUser,
            requestSecret: hooks?.requestSecret,
          }),
        );
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
  }
  // Keep the internal budget note out of the follow-up history.
  if (budgetSpent) {
    const index = messages.findIndex((m) => 'role' in m && m.role === 'developer');
    if (index >= 0) messages.splice(index, 1);
  }

  return { assistantText, toolResults, state: { messages } };
}

export function appendUserMessage(state: AgentLoopState, text: string): AgentLoopState {
  return { messages: [...state.messages, { role: 'user', content: text }] };
}

export function createInitialState(userText: string): AgentLoopState {
  return appendUserMessage({ messages: [] }, userText);
}
