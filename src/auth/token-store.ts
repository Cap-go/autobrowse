import { SECURE_STORAGE_KEYS } from '../config';
import type { OAuthCredentialRecord } from './types';
import { secureGet, secureRemove, secureSet } from './secure-storage';

function storageKeyForClient(clientId: string): string {
  return `${SECURE_STORAGE_KEYS.credentialsPrefix}${clientId}`;
}

export async function saveCredentials(record: OAuthCredentialRecord): Promise<void> {
  await secureSet(storageKeyForClient(record.clientId), JSON.stringify(record));
}

export async function loadCredentials(clientId: string): Promise<OAuthCredentialRecord | null> {
  const raw = await secureGet(storageKeyForClient(clientId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as OAuthCredentialRecord;
  } catch {
    // Damaged entry: treat as signed out instead of failing the launch.
    await secureRemove(storageKeyForClient(clientId)).catch(() => undefined);
    return null;
  }
}

export async function loadLatestCredentials(): Promise<OAuthCredentialRecord | null> {
  const activeClientId = await secureGet(`${SECURE_STORAGE_KEYS.credentialsPrefix}active`);
  if (!activeClientId) {
    return null;
  }
  return loadCredentials(activeClientId);
}

export async function setActiveClientId(clientId: string): Promise<void> {
  await secureSet(`${SECURE_STORAGE_KEYS.credentialsPrefix}active`, clientId);
}

export async function clearCredentials(clientId: string): Promise<void> {
  await secureRemove(storageKeyForClient(clientId));
}

/** Remove every stored credential for the active account (sign out). */
export async function signOut(): Promise<void> {
  const activeKey = `${SECURE_STORAGE_KEYS.credentialsPrefix}active`;
  const activeClientId = await secureGet(activeKey);
  if (activeClientId) {
    await clearCredentials(activeClientId);
  }
  await secureRemove(activeKey);
}
