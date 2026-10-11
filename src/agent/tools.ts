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
    description: 'Tap at viewport coordinates in CSS pixels. Prefer the x/y of an element returned by browser_read_dom.',
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
    name: 'browser_fill_secret',
    description:
      'Fill a form field with a secret obtained via request_secret (password, one-time code, card number). ' +
      'You never see the value; the app fills it. Only works on the site the secret belongs to. ' +
      'Target the field with x/y from browser_read_dom or a CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        secret: { type: 'string', description: 'Secret reference, e.g. "secret:github_password" or "github_password"' },
        x: { type: 'number' },
        y: { type: 'number' },
        selector: { type: 'string' },
      },
      required: ['secret'],
      additionalProperties: false,
    },
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

/** Tools that talk to the user instead of the page. */
export const USER_TOOLS: FunctionToolDefinition[] = [
  {
    type: 'function',
    name: 'ask_user',
    description:
      'Ask the user a question and wait for the answer. Use it whenever you need a choice, a confirmation ' +
      '(before purchases, posting, sending, account changes) or missing information. Offer 2-5 short options ' +
      'when possible. Never use it to ask for passwords, codes or card numbers: use request_secret.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, description: 'Suggested answers (short)' },
        allow_free_text: { type: 'boolean', description: 'Let the user type their own answer (default true)' },
      },
      required: ['question'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'request_secret',
    description:
      'Securely ask the user for a secret (password, one-time code, card number, API key) for the current site. ' +
      'The user types it in a secure card that is not part of the chat. You receive only a reference ' +
      '"secret:<name>" to use with browser_fill_secret; you can never read the value. If the user already ' +
      'saved it for this site it is reused without asking.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short id, e.g. "github_password", "bank_otp"' },
        label: { type: 'string', description: 'What to show the user, e.g. "GitHub password"' },
        reason: { type: 'string', description: 'One sentence: why it is needed' },
        kind: { type: 'string', enum: ['password', 'otp', 'card', 'text'] },
      },
      required: ['name', 'label', 'kind'],
      additionalProperties: false,
    },
  },
];

export const USER_TOOL_NAMESPACE = {
  type: 'namespace',
  name: 'capgo_user',
  description: 'Talk to the user: ask questions and request secrets securely.',
  tools: USER_TOOLS,
} as const;
