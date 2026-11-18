import { WifiOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '@/lib/connectivity';
import { radii, useTheme } from '@/theme';

import { AppText } from './AppText';

/** A quiet notice at the top while Faara can't reach its server. */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 8 }]}
    >
      <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
        <WifiOff size={16} color={colors.gold} strokeWidth={1.75} />
        <AppText variant="label" color="gold">
          You’re offline. Payments wait until you’re back.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 60 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});
