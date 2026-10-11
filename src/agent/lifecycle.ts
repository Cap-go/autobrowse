/**
 * Foreground/background state shared by the agent and the UI. iOS suspends
 * the app soon after it leaves the screen, so the agent pauses between steps
 * and resumes when the user comes back instead of failing mid-request.
 */
type Listener = (active: boolean) => void;

let active = true;
let waiters: Array<() => void> = [];
const listeners = new Set<Listener>();

export function isAppActive(): boolean {
  return active;
}

/** Resolves immediately in the foreground, otherwise when the app returns. */
export function whenActive(): Promise<void> {
  if (active) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

export function onAppActiveChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by the platform listener (see src/main.ts). */
export function setAppActive(next: boolean): void {
  if (next === active) return;
  active = next;
  if (active) {
    const ready = waiters;
    waiters = [];
    ready.forEach((resolve) => resolve());
  }
  for (const listener of listeners) listener(active);
}
