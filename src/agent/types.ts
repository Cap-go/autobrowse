export type BrowserToolName =
  | 'browser_navigate'
  | 'browser_screenshot'
  | 'browser_click'
  | 'browser_type'
  | 'browser_scroll'
  | 'browser_read_dom'
  | 'browser_extract';

export interface AgentMessage {
  role: 'user' | 'assistant';
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
