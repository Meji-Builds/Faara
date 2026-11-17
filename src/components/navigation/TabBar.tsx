import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useRouter } from 'expo-router';
import { FileText, House, TextAlignJustify, User, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HumMark } from '@/components/brand';
import { AppText } from '@/components/ui';
import { palette, useTheme } from '@/theme';

const TAB_META: Record<string, { label: string; Icon: LucideIcon }> = {
  home: { label: 'Home', Icon: House },
  activity: { label: 'Activity', Icon: TextAlignJustify },
  invoices: { label: 'Invoices', Icon: FileText },
  profile: { label: 'Profile', Icon: User },
};

const HUM_BUTTON_SIZE = 64;

/**
 * Bottom navigation with a raised Hum button in the centre.
 * The Hum button opens the hum flow; it is not a tab destination.
 */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const tabs = state.routes.map((route, index) => {
    const meta = TAB_META[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    const tint = focused ? colors.accentText : colors.textMuted;

    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={styles.tab}
      >
        <meta.Icon size={24} color={tint} strokeWidth={1.75} />
        <AppText variant="label" style={[styles.tabLabel, { color: tint }]}>
          {meta.label}
        </AppText>
      </Pressable>
    );
  });

  const visible = tabs.filter(Boolean);
  const middle = Math.ceil(visible.length / 2);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {visible.slice(0, middle)}
      <View style={styles.humSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hum: pay someone nearby"
          onPress={() => router.push('/hum')}
          style={({ pressed }) => [
            styles.humButton,
            { backgroundColor: colors.accent, borderColor: colors.background },
            pressed && styles.pressed,
          ]}
        >
          <HumMark size={24} color={palette.nearBlack} />
        </Pressable>
      </View>
      {visible.slice(middle)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth * 2, paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabLabel: { fontSize: 12 },
  humSlot: { flex: 1, alignItems: 'center' },
  humButton: {
    width: HUM_BUTTON_SIZE,
    height: HUM_BUTTON_SIZE,
    borderRadius: 24,
    borderWidth: 6,
    boxSizing: 'content-box',
    marginTop: -HUM_BUTTON_SIZE / 2 - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.96 }] },
});
