import { NativeNavigation } from '@capgo/native-navigation';
import { completeSignIn } from '../auth/oauth';
import { loadLatestCredentials } from '../auth/token-store';
import type { OAuthCredentialRecord } from '../auth/types';
import { createInitialState, runAgentTurn } from '../agent/loop';
import { openBrowser } from '../browser/browser-controller';

type Screen = 'connect' | 'main';

export class App {
  private root: HTMLElement;
  private screen: Screen = 'connect';
  private creds: OAuthCredentialRecord | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    await NativeNavigation.configure({
      enabled: true,
      platformStyle: 'auto',
      contentInsetMode: 'css',
    });

    this.creds = await loadLatestCredentials();
    this.screen = this.creds ? 'main' : 'connect';
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    if (this.screen === 'connect') {
      this.renderConnect();
      return;
    }
    this.renderMain();
  }

  private renderConnect(): void {
    const section = document.createElement('section');
    section.className = 'screen connect-screen';

    const logo = document.createElement('div');
    logo.className = 'brand';
    logo.textContent = 'Capgo Browser';

    const title = document.createElement('h1');
    title.textContent = 'Connect ChatGPT';

    const copy = document.createElement('p');
    copy.className = 'lede';
    copy.textContent =
      'Sign in with your ChatGPT account to let the agent browse for you using your plan.';

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Continue with ChatGPT';

    const status = document.createElement('p');
    status.className = 'status';
    status.hidden = true;

    button.addEventListener('click', async () => {
      button.disabled = true;
      status.hidden = false;
      status.textContent = 'Opening sign in...';
      try {
        this.creds = await completeSignIn();
        this.screen = 'main';
        this.render();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        button.disabled = false;
      }
    });

    section.append(logo, title, copy, button, status);
    this.root.append(section);
  }

  private renderMain(): void {
    const section = document.createElement('section');
    section.className = 'screen main-screen';

    const header = document.createElement('header');
    header.className = 'main-header';
    const email = document.createElement('span');
    email.className = 'email';
    email.textContent = this.creds?.email ?? 'Connected';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = 'Open browser';
    openBtn.addEventListener('click', () => {
      void openBrowser('https://example.com');
    });

    header.append(email, openBtn);

    const chat = document.createElement('div');
    chat.className = 'chat-panel';

    const log = document.createElement('div');
    log.className = 'chat-log';

    const form = document.createElement('form');
    form.className = 'chat-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask the agent to browse...';
    input.autocomplete = 'off';
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Send';
    form.append(input, send);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || !this.creds) {
        return;
      }
      input.value = '';
      appendBubble(log, 'user', text);
      const pending = appendBubble(log, 'assistant', '');
      send.disabled = true;
      try {
        const result = await runAgentTurn(this.creds, createInitialState(text), {
          onAssistantDelta: (delta) => {
            pending.textContent += delta;
          },
          onToolStart: (name) => {
            appendBubble(log, 'assistant', `[tool] ${name}`);
          },
        });
        if (!pending.textContent) {
          pending.textContent = result.assistantText || 'Done.';
        }
      } catch (error) {
        pending.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        send.disabled = false;
      }
    });

    chat.append(log, form);
    section.append(header, chat);
    this.root.append(section);

    void NativeNavigation.setTabbar({
      hidden: false,
      selectedId: 'chat',
      tabs: [
        { id: 'chat', title: 'Chat' },
        { id: 'browser', title: 'Browser' },
      ],
    });
  }
}

function appendBubble(container: HTMLElement, role: 'user' | 'assistant', text: string): HTMLElement {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  container.append(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}
