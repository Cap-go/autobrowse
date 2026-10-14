import { refreshAccessToken } from './oauth';
import { saveCredentials, setActiveClientId, signOut } from './token-store';
import type { OAuthCredentialRecord } from './types';

/**
 * The signed-in ChatGPT account, shared by the UI and every agent.
 *
 * Refresh tokens rotate, so every tab must use the latest record and only one
 * refresh may run at a time. Signing out bumps the generation: a refresh that
 * finishes afterwards is dropped instead of saving the account again.
 */
let current: OAuthCredentialRecord | null = null;
let generation = 0;
let inflight: Promise<OAuthCredentialRecord> | null = null;

export function currentCredentials(): OAuthCredentialRecord | null {
  return current;
}

export function setCredentials(record: OAuthCredentialRecord | null): void {
  generation += 1;
  inflight = null;
  current = record;
}

/** Fresh credentials for `used`. Reuses a refresh already done or running for the same token. */
export async function refreshCredentials(used: OAuthCredentialRecord): Promise<OAuthCredentialRecord> {
  if (current && current.accessToken !== used.accessToken) return current;
  if (inflight) return inflight;
  const startedAt = generation;
  const base = current ?? used;
  const run = (async () => {
    const updated = await refreshAccessToken(base);
    if (generation !== startedAt) throw new Error('Signed out.');
    await saveCredentials(updated);
    await setActiveClientId(updated.clientId);
    if (generation !== startedAt) throw new Error('Signed out.');
    current = updated;
    return updated;
  })();
  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

/** Forget the account in memory first, then wait for any refresh and wipe storage. */
export async function endSession(): Promise<void> {
  const pending = inflight;
  setCredentials(null);
  await pending?.catch(() => undefined);
  await signOut();
}
