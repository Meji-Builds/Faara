/**
 * `getReactNativePersistence` ships in Firebase's React Native build of
 * `@firebase/auth` (which Metro resolves on native), but the package's public type
 * entry points at the browser build. Declare it so TypeScript sees the native API.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
