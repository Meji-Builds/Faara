import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type HumVolume = 'quiet' | 'normal' | 'loud';

/** Speaker gain for each hum volume setting. Normal decoded reliably at ~60 cm in field tests. */
export const HUM_VOLUME_GAIN: Record<HumVolume, number> = { quiet: 0.15, normal: 0.5, loud: 1 };

export interface Preferences {
  readyToReceive: boolean;
  humVolume: HumVolume;
  /** Ask for the passcode (or fingerprint) when the app opens or returns from the background. */
  appLock: boolean;
  unlockWithFingerprint: boolean;
  payWithFingerprint: boolean;
  hideBalances: boolean;
  notifyMoneyReceived: boolean;
  notifyOffers: boolean;
  /** When the notifications screen was last opened (epoch ms). */
  notificationsSeenAt: number;
  /** Naira (kobo) kept ready for paying with no network; 0 is off. */
  offlineReserveKobo: number;
}

const DEFAULTS: Preferences = {
  readyToReceive: true,
  humVolume: 'normal',
  appLock: true,
  unlockWithFingerprint: true,
  payWithFingerprint: true,
  hideBalances: false,
  notifyMoneyReceived: true,
  notifyOffers: false,
  notificationsSeenAt: 0,
  offlineReserveKobo: 0,
};

const STORAGE_KEY = 'faara.preferences';

interface PreferencesContextValue {
  preferences: Preferences;
  /** False until saved preferences have been read from storage. */
  loaded: boolean;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Device-local app preferences, persisted in AsyncStorage. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPreferences({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) });
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ preferences, loaded, setPreference }),
    [preferences, loaded, setPreference],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return context;
}
