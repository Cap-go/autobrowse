import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { h, icon } from './dom';
import { toast } from './helpers';

const MIME_BY_EXT: Record<string, string> = {
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  xml: 'application/xml',
};

/** Code-fence languages that make sense as a downloadable file. */
export const FILE_LANGUAGES: Record<string, string> = { csv: 'csv', tsv: 'tsv', json: 'json', md: 'md', markdown: 'md', txt: 'txt', text: 'txt', xml: 'xml', html: 'html' };

export function safeFilename(name: string, fallbackExt = 'txt'): string {
  const cleaned = name.trim().replace(/[/\\?%*:|"<>\n\r]+/g, '-').slice(0, 80) || 'export';
  return /\.[a-z0-9]{1,5}$/i.test(cleaned) ? cleaned : `${cleaned}.${fallbackExt}`;
}

/** Save to a temp file and open the share sheet (Save to Files, AirDrop, Mail…). */
export async function shareFile(filename: string, content: string): Promise<void> {
  const name = safeFilename(filename);
  if (!Capacitor.isNativePlatform()) {
    const ext = name.split('.').pop() ?? 'txt';
    const blob = new Blob([content], { type: MIME_BY_EXT[ext] ?? 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2_000);
    return;
  }
  const written = await Filesystem.writeFile({
    path: `exports/${name}`,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({ title: name, files: [written.uri], dialogTitle: `Save ${name}` });
}

export async function copyText(text: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Could not copy');
  }
}

/** Minimal CSV parser (quotes, escaped quotes, newlines in quotes) for previews. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Chat card for a file produced by the agent. */
export function fileCard(filename: string, content: string): HTMLElement {
  const name = safeFilename(filename);
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const size = new TextEncoder().encode(content).length;
  let meta = formatSize(size);
  let preview: HTMLElement | null = null;

  if (ext === 'csv' || ext === 'tsv') {
    const rows = parseCsv(content, ext === 'tsv' ? '\t' : ',');
    meta = `${Math.max(0, rows.length - 1)} rows · ${meta}`;
    const shown = rows.slice(0, 6);
    if (shown.length) {
      preview = h(
        'div',
        { class: 'file-preview' },
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, ...(shown[0] ?? []).map((c) => h('th', {}, c)))),
          h('tbody', {}, ...shown.slice(1).map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c))))),
        ),
      );
    }
  } else {
    preview = h('pre', { class: 'file-preview text' }, content.slice(0, 600) + (content.length > 600 ? '\n…' : ''));
  }

  const save = h('button', { class: 'primary', type: 'button' }, icon('download'), h('span', {}, 'Save / Share'));
  save.addEventListener('click', () => void shareFile(name, content).catch((e) => toast(String(e instanceof Error ? e.message : e))));
  const copy = h('button', { class: 'secondary', type: 'button' }, 'Copy');
  copy.addEventListener('click', () => void copyText(content));

  return h(
    'div',
    { class: 'file-card' },
    h('div', { class: 'file-head' }, h('span', { class: 'file-icon' }, ext.toUpperCase().slice(0, 4) || 'FILE'), h('div', {}, h('strong', {}, name), h('span', {}, meta))),
    preview,
    h('div', { class: 'file-actions' }, save, copy),
  );
}
