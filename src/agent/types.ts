export type BrowserToolName =
  | 'browser_navigate'
  | 'browser_screenshot'
  | 'browser_click'
  | 'browser_type'
  | 'browser_scroll'
  | 'browser_read_dom'
  | 'browser_extract'
  | 'browser_fill_secret'
  | 'ask_user'
  | 'request_secret';

export interface AskUserRequest {
  question: string;
  options: string[];
  allowFreeText: boolean;
}

/** `answer` is null when the user skipped. */
export interface AskUserResult {
  answer: string | null;
}

export interface SecretRequest {
  name: string;
  label: string;
  reason: string;
  kind: 'password' | 'otp' | 'card' | 'text';
  /** Site the secret is for (current page host). */
  domain: string;
}

export interface SecretRequestResult {
  provided: boolean;
  /** True when a remembered secret was reused without showing a card. */
  reused?: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'developer';
  content: string;
}

export type ToolOutput = string | Array<
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
>;

export type AgentConversationItem = AgentMessage
  | { type: 'function_call'; call_id: string; name: BrowserToolName; namespace?: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: ToolOutput };

export interface ToolCallRequest {
  id: string;
  callId: string;
  name: BrowserToolName;
  namespace?: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  output: ToolOutput;
}

export interface AgentLoopResult {
  assistantText: string;
  toolCalls: ToolCallRequest[];
}
