import type { BrowserToolName } from './types';

export interface FunctionToolDefinition {
  type: 'function';
  name: BrowserToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export const BROWSER_TOOLS: FunctionToolDefinition[] = [
  {
    type: 'function',
    name: 'browser_navigate',
    description: 'Open or navigate the in-app browser to a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute https URL' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_screenshot',
    description: 'Capture a PNG screenshot of the current page.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'browser_click',
    description: 'Click at viewport coordinates in CSS pixels.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_type',
    description: 'Focus an input by clicking, then set its value.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['text', 'x', 'y'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_scroll',
    description: 'Scroll the page by delta pixels.',
    parameters: {
      type: 'object',
      properties: {
        deltaX: { type: 'number' },
        deltaY: { type: 'number' },
      },
      required: ['deltaY'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_read_dom',
    description: 'Read visible page text and title.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'browser_extract',
    description: 'Extract text and HTML for a CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
];

/**
 * ChatGPT plan usage only accepts function tools grouped in a namespace
 * (see SIWC "Preview limitations"). `browser` is reserved by OpenAI.
 */
export const BROWSER_TOOL_NAMESPACE = {
  type: 'namespace',
  name: 'capgo_browser',
  description: 'Control the in-app web browser: open pages, read them, click, type and scroll.',
  tools: BROWSER_TOOLS,
} as const;
