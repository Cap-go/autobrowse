import { FILE_LANGUAGES, copyText, shareFile } from './export';

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
  const flushAll = (): void => {
    flushParagraph();
    closeList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trimEnd();

    // Fenced code block (an unclosed fence while streaming runs to the end).
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      flushAll();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence[1] ?? '```')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      frag.append(codeBlock(body.join('\n'), (fence[2] ?? '').toLowerCase()));
      continue;
    }

    // Table: header row, then |---|---| separator.
    const next = (lines[i + 1] ?? '').trim();
    if (line.includes('|') && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(next)) {
      flushAll();
      const rows: string[][] = [splitRow(line)];
      i += 2;
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) {
        rows.push(splitRow(lines[i] ?? ''));
        i += 1;
      }
      i -= 1;
      frag.append(table(rows, onLink));
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);

    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      frag.append(document.createElement('hr'));
      continue;
    }
    if (heading) {
      flushAll();
      const h = document.createElement('h4');
      appendInline(h, heading[1] ?? '', onLink);
      frag.append(h);
      continue;
    }
    if (quote) {
      flushAll();
      const q = document.createElement('blockquote');
      appendInline(q, quote[1] ?? '', onLink);
      frag.append(q);
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
  flushAll();
  return frag;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function table(rows: string[][], onLink?: (url: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'md-table';
  const t = document.createElement('table');
  rows.forEach((cells, index) => {
    const tr = document.createElement('tr');
    for (const cell of cells) {
      const td = document.createElement(index === 0 ? 'th' : 'td');
      appendInline(td, cell, onLink);
      tr.append(td);
    }
    t.append(tr);
  });
  wrap.append(t);
  // Tables are data: offer them as CSV too.
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  wrap.append(fileButtons(csv, 'table.csv'));
  return wrap;
}

function csvCell(value: string): string {
  const plain = value.replace(/\*\*|`/g, '');
  return /[",\n]/.test(plain) ? `"${plain.replace(/"/g, '""')}"` : plain;
}

function codeBlock(code: string, lang: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'code-block';
  const head = document.createElement('div');
  head.className = 'code-head';
  const label = document.createElement('span');
  label.textContent = lang || 'code';
  head.append(label);
  const ext = FILE_LANGUAGES[lang];
  head.append(fileButtons(code, ext ? `export.${ext}` : null));
  const pre = document.createElement('pre');
  const c = document.createElement('code');
  c.textContent = code;
  pre.append(c);
  block.append(head, pre);
  return block;
}

/** Copy (+ Save file when the content is a file format). */
function fileButtons(content: string, filename: string | null): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'code-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => void copyText(content));
  actions.append(copy);
  if (filename) {
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save file';
    save.addEventListener('click', () => void shareFile(filename, content));
    actions.append(save);
  }
  return actions;
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
