import { Platform, type TextStyle } from 'react-native';

/**
 * Removes the browser's default focus outline from text inputs on web;
 * focus is shown with the field border instead. No-op on native.
 */
export const inputFocusReset: TextStyle =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : {};
