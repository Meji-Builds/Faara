import { Platform } from 'react-native';

/** The native animation driver is unavailable on web; fall back to JS there. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
