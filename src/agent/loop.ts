import type { OAuthCredentialRecord } from '../auth/types';
import { refreshAccessToken } from '../auth/oauth';
import { runBrowserTool } from './browser-tools-runner';
import { createResponseStream } from './responses-api';
import type { AgentMessage, ToolCallRequest, ToolCallResult } from './types';

export interface AgentLoopState {
  messages: AgentMessage[];
  previousResponseId?: string;
}

export interface AgentLoopHooks {
  onAssistantDelta?: (delta: string) => void;
  onToolStart?: (name: string) => void;
}

export interface AgentTurnResult {
  assistantText: string;
  state: AgentLoopState;
  toolResults: ToolCallResult[];
}

async function withFreshToken(
  creds: OAuthCredentialRecord,
  fn: (token: string) => Promise<AgentTurnResult>,
): Promise<AgentTurnResult> {
  const skewMs = 60_000;
  let record = creds;
  if (Date.now() >= record.expiresAtMs - skewMs) {
    record = await refreshAccessToken(record);
  }

  try {
    return await fn(record.accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('401') || message.includes('invalid_token')) {
      record = await refreshAccessToken(record);
      return fn(record.accessToken);
    }
    throw error;
  }
}

export async function runAgentTurn(
  creds: OAuthCredentialRecord,
  state: AgentLoopState,
  hooks?: AgentLoopHooks,
): Promise<AgentTurnResult> {
  return withFreshToken(creds, async (accessToken) => {
    const stream = await createResponseStream({
      accessToken,
      messages: state.messages,
      previousResponseId: state.previousResponseId,
    });

    let assistantText = '';
    let responseId = state.previousResponseId;
    const pendingTools: ToolCallRequest[] = [];

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        assistantText += event.delta;
        hooks?.onAssistantDelta?.(event.delta);
      }
      if (event.type === 'completed') {
        assistantText = event.parsed.assistantText || assistantText;
        responseId = event.parsed.responseId;
        pendingTools.push(...event.parsed.toolCalls);
      }
    }

    const toolResults: ToolCallResult[] = [];
    for (const call of pendingTools) {
      hooks?.onToolStart?.(call.name);
      const output = await runBrowserTool(call.name, call.arguments);
      toolResults.push({ toolCallId: call.id, output });
    }

    const nextMessages: AgentMessage[] = [...state.messages];
    if (assistantText.trim()) {
      nextMessages.push({ role: 'assistant', content: assistantText });
    }

    return {
      assistantText,
      toolResults,
      state: {
        messages: nextMessages,
        previousResponseId: responseId,
      },
    };
  });
}

export function createInitialState(userText: string): AgentLoopState {
  return {
    messages: [{ role: 'user', content: userText }],
  };
}
