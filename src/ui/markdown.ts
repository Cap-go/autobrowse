/**
 * Minimal, safe Markdown for agent replies: paragraphs, bullet/numbered lists,
 * headings, **bold**, *italic*, `code` and [links](https://…). Builds DOM nodes
 * (never innerHTML) so model output cannot inject markup.
 */
export function renderMarkdown(text: string, onLink?: (url: string) => void): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let list: HTMLElement | null = null;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const p = document.createElement('p');
    appendInline(p, paragraph.join(' '), onLink);
    frag.append(p);
    paragraph = [];
  };
  const closeList = (): void => {
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    if (heading) {
      flushParagraph();
      closeList();
      const h = document.createElement('h4');
      appendInline(h, heading[1] ?? '', onLink);
      frag.append(h);
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'UL' : 'OL';
      if (!list || list.tagName !== tag) {
        list = document.createElement(tag.toLowerCase());
        frag.append(list);
      }
      const li = document.createElement('li');
      appendInline(li, (bullet ? bullet[1] : numbered?.[2]) ?? '', onLink);
      list.append(li);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  return frag;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g;

function appendInline(parent: HTMLElement, text: string, onLink?: (url: string) => void): void {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > last) parent.append(text.slice(last, index));
    last = index + token.length;

    if (token.startsWith('**')) {
      const b = document.createElement('strong');
      b.textContent = token.slice(2, -2);
      parent.append(b);
    } else if (token.startsWith('`')) {
      const c = document.createElement('code');
      c.textContent = token.slice(1, -1);
      parent.append(c);
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      parent.append(link(m?.[1] ?? token, m?.[2] ?? '', onLink));
    } else if (token.startsWith('http')) {
      parent.append(link(token.replace(/^https?:\/\/(www\.)?/, ''), token, onLink));
    } else {
      const i = document.createElement('em');
      i.textContent = token.slice(1, -1);
      parent.append(i);
    }
  }
  if (last < text.length) parent.append(text.slice(last));
}

function link(label: string, url: string, onLink?: (url: string) => void): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = url;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    onLink?.(url);
  });
  return a;
}
