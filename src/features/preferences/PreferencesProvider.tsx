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
  payWithFingerprint: boolean;
  hideBalances: boolean;
  notifyMoneyReceived: boolean;
  notifyOffers: boolean;
}

const DEFAULTS: Preferences = {
  readyToReceive: true,
  humVolume: 'normal',
  payWithFingerprint: true,
  hideBalances: false,
  notifyMoneyReceived: true,
  notifyOffers: false,
};

const STORAGE_KEY = 'faara.preferences';

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Device-local app preferences, persisted in AsyncStorage. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPreferences({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) });
      })
      .catch(() => undefined);
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

  const value = useMemo(() => ({ preferences, setPreference }), [preferences, setPreference]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return context;
}
