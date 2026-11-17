import { useRouter } from 'expo-router';
import { ArrowDownLeft, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useNotifications } from '@/features/notifications';
import { radii, useTheme } from '@/theme';

/** In-app banner for money that arrives while the app is open. Tap to open the receipt. */
export function IncomingBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { alert, dismissAlert } = useNotifications();
  if (!alert) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}. ${alert.body}`}
        onPress={() => {
          dismissAlert();
          router.push({ pathname: '/receipt/[paymentId]', params: { paymentId: alert.paymentId } });
        }}
        style={[styles.banner, { backgroundColor: colors.brand, borderColor: colors.accent }]}
      >
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <ArrowDownLeft size={20} color={colors.onAccent} strokeWidth={2.25} />
        </View>
        <View style={styles.text}>
          <AppText variant="subheading" color="onBrand" numberOfLines={1}>
            {alert.title}
          </AppText>
          <AppText variant="label" color="onBrandMuted" numberOfLines={1}>
            {alert.body}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={dismissAlert}
          hitSlop={12}
        >
          <X size={18} color={colors.onBrandMuted} strokeWidth={2} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
