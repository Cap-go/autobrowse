import { secureGet, secureRemove, secureSet } from '../auth/secure-storage';

/**
 * Secrets the agent can use but never see.
 *
 * The model only receives references (`secret:<name>`). Values stay here:
 * in memory for the session, and in the Keychain/Keystore when the user
 * chooses "Remember on this device". A secret is bound to the site it was
 * entered for and can only be filled into pages of that site.
 */
export type SecretKind = 'password' | 'otp' | 'card' | 'text';

export interface SecretMeta {
  name: string;
  label: string;
  domain: string;
  kind: SecretKind;
  remembered: boolean;
}

interface SecretEntry extends SecretMeta {
  value: string;
}

const INDEX_KEY = 'capgo_secret_index';
const VALUE_PREFIX = 'capgo_secret_';
const MIN_REDACT_LENGTH = 3;

/** Normalised site a secret belongs to: hostname without `www.`. */
export function siteOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * True when `host` is the secret's site or one of its subdomains
 * (a secret for example.com works on login.example.com, never the reverse,
 * so a sibling subdomain cannot receive it).
 */
export function siteMatches(secretDomain: string, host: string): boolean {
  if (!secretDomain || !host) return false;
  const a = secretDomain.toLowerCase();
  const b = host.toLowerCase().replace(/^www\./, '');
  return a === b || b.endsWith(`.${a}`);
}

export function normalizeSecretName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 64) || 'secret';
}

function keyFor(name: string, domain: string): string {
  return `${normalizeSecretName(name)}@${domain}`;
}

export class SecretVault {
  private entries = new Map<string, SecretEntry>();
  private loaded: Promise<void> | null = null;

  /** Load remembered secrets from secure storage (once). */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      const raw = await secureGet(INDEX_KEY);
      if (!raw) return;
      let index: SecretMeta[] = [];
      try {
        index = JSON.parse(raw) as SecretMeta[];
      } catch {
        return;
      }
      for (const meta of index) {
        const value = await secureGet(VALUE_PREFIX + keyFor(meta.name, meta.domain));
        if (value) this.entries.set(keyFor(meta.name, meta.domain), { ...meta, value, remembered: true });
      }
    })();
    return this.loaded;
  }

  find(name: string, host: string): SecretMeta | null {
    const wanted = normalizeSecretName(name);
    for (const entry of this.entries.values()) {
      // One-time codes expire: always ask for a new one.
      if (entry.kind === 'otp') continue;
      if (entry.name === wanted && siteMatches(entry.domain, host)) return stripValue(entry);
    }
    return null;
  }

  async save(input: { name: string; label: string; domain: string; kind: SecretKind; value: string; remember: boolean }): Promise<SecretMeta> {
    const entry: SecretEntry = {
      name: normalizeSecretName(input.name),
      label: input.label.trim() || input.name,
      domain: input.domain,
      kind: input.kind,
      value: input.value,
      remembered: input.remember,
    };
    const key = keyFor(entry.name, entry.domain);
    this.entries.set(key, entry);
    try {
      if (entry.remembered) {
        await secureSet(VALUE_PREFIX + key, entry.value);
      } else {
        await secureRemove(VALUE_PREFIX + key);
      }
      await this.persistIndex();
    } catch {
      // Secure storage failed: keep it for this session only.
      entry.remembered = false;
      await secureRemove(VALUE_PREFIX + key).catch(() => undefined);
    }
    return stripValue(entry);
  }

  async remove(name: string, domain: string): Promise<void> {
    const key = keyFor(name, domain);
    this.entries.delete(key);
    await secureRemove(VALUE_PREFIX + key);
    await this.persistIndex();
  }

  async clear(): Promise<void> {
    // Include remembered secrets that were never loaded this session.
    await this.load().catch(() => undefined);
    for (const entry of [...this.entries.values()]) await this.remove(entry.name, entry.domain);
  }

  list(): SecretMeta[] {
    return [...this.entries.values()].map(stripValue);
  }

  /**
   * Value for filling a page. Only returned when the page belongs to the
   * secret's site; callers must never send it to the model.
   */
  valueForFill(name: string, host: string): string {
    const wanted = normalizeSecretName(name.replace(/^secret:/, ''));
    let elsewhere = '';
    for (const entry of this.entries.values()) {
      if (entry.name !== wanted) continue;
      if (siteMatches(entry.domain, host)) return entry.value;
      elsewhere ||= entry.domain;
    }
    if (elsewhere) {
      throw new Error(`Secret "${wanted}" belongs to ${elsewhere} and cannot be used on ${host || 'this page'}.`);
    }
    throw new Error(`No secret named "${wanted}". Call request_secret first.`);
  }

  /** Replace every known secret value in text that is about to reach the model. */
  redact(text: string): string {
    let out = text;
    for (const entry of this.entries.values()) {
      if (entry.value.length < MIN_REDACT_LENGTH) continue;
      // Page text reaches the model as JSON, where quotes and backslashes are escaped.
      const forms = new Set([entry.value, JSON.stringify(entry.value).slice(1, -1), encodeURIComponent(entry.value)]);
      for (const form of forms) out = out.split(form).join(`[REDACTED secret:${entry.name}]`);
    }
    return out;
  }

  private async persistIndex(): Promise<void> {
    const remembered = [...this.entries.values()].filter((e) => e.remembered).map(stripValue);
    if (remembered.length) await secureSet(INDEX_KEY, JSON.stringify(remembered));
    else await secureRemove(INDEX_KEY);
  }
}

function stripValue(entry: SecretEntry): SecretMeta {
  return { name: entry.name, label: entry.label, domain: entry.domain, kind: entry.kind, remembered: entry.remembered };
}

/** App-wide vault. */
export const vault = new SecretVault();
