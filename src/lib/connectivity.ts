import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Whether Faara can reach its server right now. It's learned from real requests (a failed
 * request means offline, a successful one means online) and, on the web, from the browser.
 */
let online = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach((listener) => listener());
}

export function reportNetwork(reachable: boolean): void {
  set(reachable);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  online = navigator.onLine;
  window.addEventListener('online', () => set(true));
  window.addEventListener('offline', () => set(false));
}

/** True while the server is reachable. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => true,
  );
}
