import { APP_LINKS, PREF_KEYS } from '../config';
import { h, icon } from './dom';
import { openExternal } from './helpers';

/**
 * App Store guideline 5.1.2(i): tell the user which data goes to a third-party
 * AI (OpenAI) and get explicit permission before sending any of it.
 * Nothing reaches the model until the user taps "Allow".
 */
export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(PREF_KEYS.aiConsent) === '1';
  } catch {
    return false;
  }
}

export function setAiConsent(allowed: boolean): void {
  try {
    if (allowed) localStorage.setItem(PREF_KEYS.aiConsent, '1');
    else localStorage.removeItem(PREF_KEYS.aiConsent);
  } catch {
    /* private mode */
  }
}

type OpenSheet = (title: string, content: HTMLElement, onClose?: () => void) => () => void;

let pending: Promise<boolean> | null = null;

/** Show the consent sheet (once at a time). Resolves true only on an explicit "Allow". */
export function requestAiConsent(openSheet: OpenSheet): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  pending ??= showSheet(openSheet).finally(() => {
    pending = null;
  });
  return pending;
}

function showSheet(openSheet: OpenSheet): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const decide = (allowed: boolean): void => {
      if (decided) return;
      decided = true;
      setAiConsent(allowed);
      resolve(allowed);
    };

    const allow = h('button', { class: 'primary block', type: 'button' }, 'Allow');
    const deny = h('button', { class: 'secondary block', type: 'button' }, "Don't allow");

    const close = openSheet(
      'Share data with OpenAI?',
      h(
        'div',
        { class: 'sheet-body consent' },
        h(
          'p',
          { class: 'lede' },
          'To do your tasks, Auto Browse sends data to OpenAI (ChatGPT), a third-party AI service, using your ChatGPT account.',
        ),
        h('p', { class: 'section-label' }, 'What is sent'),
        h(
          'ul',
          { class: 'bullets' },
          item('chat', 'Your messages, including dictated text'),
          item('globe', 'Text, links and screenshots of the pages the agent opens'),
          item('hand', 'Your answers to the agent’s questions'),
        ),
        h('p', { class: 'section-label' }, 'Never sent'),
        h('ul', { class: 'bullets' }, item('lock', 'Passwords and secrets you type in secure cards')),
        h(
          'p',
          { class: 'fine' },
          'OpenAI uses this data to understand your request and act on the page, under its own privacy policy. Capgo does not store it. You can turn this off at any time in Settings. See the ',
          link('Auto Browse Privacy Policy', APP_LINKS.privacy),
          ' and ',
          link('OpenAI Privacy Policy', APP_LINKS.openaiPrivacy),
          '.',
        ),
        allow,
        deny,
      ),
      () => decide(false),
    );
    allow.addEventListener('click', () => {
      decide(true);
      close();
    });
    deny.addEventListener('click', () => {
      decide(false);
      close();
    });
  });
}

function item(name: Parameters<typeof icon>[0], text: string): HTMLElement {
  return h('li', {}, h('span', { class: 'bullet-icon' }, icon(name)), h('span', {}, text));
}

function link(label: string, url: string): HTMLElement {
  const a = h('a', { href: url }, label);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    void openExternal(url);
  });
  return a;
}
