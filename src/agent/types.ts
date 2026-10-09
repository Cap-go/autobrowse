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

export interface ToolCallRequest {
  id: string;
  name: BrowserToolName;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  output: string;
}

export interface AgentLoopResult {
  assistantText: string;
  toolCalls: ToolCallRequest[];
}
