import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useAppActive } from './useAppActive';

/**
 * Checks for a newer version of the app's code when Faara comes to the front, downloads
 * it, and offers to restart into it. Only in installed builds; the web updates itself.
 */
export function useAppUpdate(): void {
  const active = useAppActive();
  const offered = useRef(false);
  useEffect(() => {
    if (!active || offered.current || __DEV__ || !Updates.isEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || cancelled) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew || cancelled || offered.current) return;
        offered.current = true;
        Alert.alert('Faara has been updated', 'Restart now to use the newest version.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart', onPress: () => void Updates.reloadAsync() },
        ]);
      } catch {
        // Offline or the update service is unreachable: try again next time.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);
}
