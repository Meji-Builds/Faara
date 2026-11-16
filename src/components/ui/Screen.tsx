import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { SCREEN_GUTTER, useTheme } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Pinned to the bottom, outside the scroll area (primary actions). */
  footer?: ReactNode;
  /** Wrap content in a ScrollView. Defaults to true. */
  scroll?: boolean;
  /** Override the background colour, e.g. the brand green on Success. */
  background?: string;
  /** Use light status bar content regardless of theme (for brand-coloured screens). */
  lightStatusBar?: boolean;
  /** Safe-area edges to inset. Tab screens omit the bottom edge. */
  edges?: Edge[];
  contentStyle?: ViewStyle;
}

/** Base screen container: safe area, theme background, gutters and an optional pinned footer. */
export function Screen({
  children,
  footer,
  scroll = true,
  background,
  lightStatusBar = false,
  edges = ['top', 'bottom'],
  contentStyle,
}: ScreenProps) {
  const { colors, scheme } = useTheme();
  const statusBarStyle = lightStatusBar || scheme === 'dark' ? 'light' : 'dark';
  const content = [styles.content, contentStyle];

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.root, { backgroundColor: background ?? colors.background }]}
    >
      <StatusBar style={statusBarStyle} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, content]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, content]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: SCREEN_GUTTER },
  footer: { paddingHorizontal: SCREEN_GUTTER, paddingTop: 12, paddingBottom: 12, gap: 12 },
});
