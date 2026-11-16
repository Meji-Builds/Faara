import { Redirect, useRouter } from 'expo-router';
import { Check, Upload } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AdireBand, Rings } from '@/components/brand';
import { AppText, Button, Screen } from '@/components/ui';
import { useHumDraft } from '@/features/hum';
import { fonts, palette, radii, useTheme } from '@/theme';

/** "AbC123xyz…" → "HUM-ABC1-23XY": short, readable reference from the payment id. */
function referenceFor(paymentId: string): string {
  const clean = paymentId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `HUM-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

export default function SuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amountLabel, note, session, chosen, reset } = useHumDraft();

  if (!session || !chosen) return <Redirect href="/hum" />;
  const recipient = { name: chosen.recipient.fullName };

  const done = () => {
    reset();
    router.dismissTo('/home');
  };

  const rows: [string, string, boolean?][] = [
    ['For', note || '—'],
    ['Sent by', 'Sound'],
    ['Fee', 'Free'],
    ['Reference', referenceFor(session.paymentId), true],
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.brand }]}>
      <AdireBand color={colors.brandLine} />
      <Rings
        radii={[90, 150, 210, 270]}
        color={colors.brandLine}
        center={{ x: 195, y: 300 }}
        opacity={0.6}
      />
      <Screen
        background="transparent"
        lightStatusBar
        edges={['bottom']}
        footer={
          <View style={styles.actions}>
            <Button
              label="Receipt"
              variant="outline"
              tone="accent"
              icon={<Upload size={20} color={palette.electricTeal} strokeWidth={1.75} />}
              style={styles.action}
            />
            <Button label="Done" onPress={done} style={styles.action} />
          </View>
        }
      >
        <View style={styles.hero}>
          <View style={[styles.check, { backgroundColor: colors.accent }]}>
            <Check size={56} color={palette.nearBlack} strokeWidth={3} />
          </View>
          <AppText style={[styles.title, { color: colors.onBrand }]} accessibilityRole="header">
            Hummed.
          </AppText>
          <AppText variant="body" color="onBrand" align="center" style={styles.summary}>
            {amountLabel} is with{' '}
            <AppText variant="subheading" color="onBrand">
              {recipient.name}
            </AppText>
          </AppText>
          <AppText variant="body" color="onBrandMuted" align="center">
            Test payment: no money moves until wallets are connected
          </AppText>
        </View>

        <View
          style={[
            styles.receipt,
            { backgroundColor: colors.brandInset, borderColor: colors.brandLine },
          ]}
        >
          {rows.map(([label, value, mono], index) => (
            <View
              key={label}
              style={[
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.brandLine },
              ]}
            >
              <AppText variant="body" color="onBrandMuted">
                {label}
              </AppText>
              <AppText
                variant={mono ? 'mono' : 'bodyStrong'}
                color="onBrand"
                style={styles.value}
                numberOfLines={1}
              >
                {value}
              </AppText>
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hero: { alignItems: 'center', marginTop: 56, gap: 8 },
  check: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: fonts.display, fontSize: 52, lineHeight: 60, letterSpacing: -2.5 },
  summary: { fontSize: 17, marginTop: 4 },
  receipt: { borderRadius: radii.xl, borderWidth: 1, marginTop: 28, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    marginHorizontal: 20,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
