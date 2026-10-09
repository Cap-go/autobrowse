import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { Capacitor } from '@capacitor/core';

const memory = new Map<string, string>();

export async function secureGet(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await SecureStoragePlugin.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  }
  return memory.get(key) ?? null;
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await SecureStoragePlugin.set({ key, value });
    return;
  }
  memory.set(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SecureStoragePlugin.remove({ key });
    } catch {
      /* missing key */
    }
    return;
  }
  memory.delete(key);
}
