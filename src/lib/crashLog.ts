import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers the error that last closed the app, so it can be shown on the next launch. In
 * release builds a fatal JavaScript error closes the app with no message; this keeps the
 * reason. (A crash in native code can't be caught here.)
 */
const KEY = 'faara.lastCrash.v1';

type Handler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(handler: Handler): void;
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stack = (error.stack ?? '').split('\n').slice(1, 6).join('\n');
  return `${error.name}: ${error.message}${stack ? `\n${stack}` : ''}`;
}

export function installCrashLog(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    // Save first, then let React Native close the app as it normally would.
    AsyncStorage.setItem(KEY, JSON.stringify({ text: describe(error), at: Date.now() }))
      .catch(() => undefined)
      .finally(() => previous(error, isFatal));
  });
}

/** The saved crash, if any, removed once read. */
export async function takeLastCrash(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (!saved) return null;
    await AsyncStorage.removeItem(KEY);
    return (JSON.parse(saved) as { text: string }).text;
  } catch {
    return null;
  }
}
