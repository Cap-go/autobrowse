type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny element factory: h('button', { class: 'primary', onclick }, 'Go'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    el.append(child);
  }
  return el;
}

/** Parse a trusted, static SVG string (icons only). */
export function svg(markup: string): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGElement;
}

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  logo: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="chr" gradientUnits="userSpaceOnUse" x1="18" y1="16" x2="35" y2="52"><stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="#d9dee5"/><stop offset=".45" stop-color="#8d96a3"/><stop offset=".52" stop-color="#f4f6f9"/><stop offset=".75" stop-color="#aab2bd"/><stop offset="1" stop-color="#e9edf2"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="#0E8F6E"/><g fill="none" stroke="url(#chr)" stroke-width="3.4" stroke-linecap="round"><circle cx="30.8" cy="33.8" r="16.4"/><path d="M14.4 33.8h32.8M30.8 17.4c-5.8 5.1-5.8 27.7 0 32.8M30.8 17.4c5.8 5.1 5.8 27.7 0 32.8"/></g><path d="M48.1 10l2.1 5 5 2.1-5 2.1-2.1 5-2.1-5-5-2.1 5-2.1z" fill="#fff"/><path d="M53.5 24.1l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" fill="#fff"/></svg>`,
  send: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${stroke}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" ${stroke}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${stroke}><path d="M20 6 9 17l-5-5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${stroke}><path d="m9 18 6-6-6-6"/></svg>`,
  external: `<svg viewBox="0 0 24 24" ${stroke}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" ${stroke}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" ${stroke}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
  shrink: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 5v14M5 12h14"/></svg>`,
} as const;

export function icon(name: keyof typeof icons, className = 'icon'): SVGElement {
  const el = svg(icons[name]);
  el.setAttribute('class', className);
  return el;
}
