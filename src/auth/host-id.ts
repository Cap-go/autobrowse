import { SECURE_STORAGE_KEYS } from '../config';
import { randomString } from './pkce';
import { secureGet, secureSet } from './secure-storage';

export async function getOrCreateExtAgentHostId(): Promise<string> {
  const existing = await secureGet(SECURE_STORAGE_KEYS.hostId);
  if (existing) {
    return existing;
  }
  const hostId = `urn:uuid:${crypto.randomUUID?.() ?? randomString(32)}`;
  await secureSet(SECURE_STORAGE_KEYS.hostId, hostId);
  return hostId;
}
