import { Redirect, useRouter } from 'expo-router';
import { Download } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdireBand, Rings, SuccessBurst } from '@/components/brand';
import { CountUp, Reveal } from '@/components/motion';
import { AppText, Button, Screen } from '@/components/ui';
import { useHumDraft } from '@/features/hum';
import { CHANNEL_LABEL, receiptReference } from '@/features/receipts';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

export default function SuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amount, currency, note, session, chosen, claims, settlement, reset } = useHumDraft();

  useEffect(() => {
    haptics.success();
  }, []);

  if (!session || !chosen || !settlement) return <Redirect href="/hum" />;
  const recipient = { name: chosen.recipient.fullName };
  const channel = claims.find((claim) => claim.id === chosen.claimId)?.channel ?? 'sound';
  const reference = receiptReference(session.paymentId);
  const seconds = (settlement.elapsedMs / 1000).toFixed(1);

  const openReceipt = () =>
    router.push({ pathname: '/receipt/[paymentId]', params: { paymentId: session.paymentId } });

  const done = () => {
    reset();
    router.dismissTo('/home');
  };

  const rows: [string, string, boolean?][] = [
    ['For', note || '—'],
    ['Sent by', CHANNEL_LABEL[channel]],
    ['Fee', 'Free'],
    ['Reference', reference, true],
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
          <>
            <View style={styles.actions}>
              <Button
                label="Receipt"
                onPress={openReceipt}
                variant="outline"
                tone="accent"
                icon={<Download size={20} color={palette.electricTeal} strokeWidth={1.75} />}
                style={styles.action}
              />
              <Button label="Done" onPress={done} style={styles.action} />
            </View>
          </>
        }
      >
        <View style={styles.hero}>
          <View style={styles.check}>
            <SuccessBurst size={112} />
          </View>
          <Reveal delay={260}>
            <AppText style={[styles.title, { color: colors.onBrand }]} accessibilityRole="header">
              Hummed.
            </AppText>
          </Reveal>
          <CountUp
            value={amount}
            delay={380}
            format={(value) =>
              formatMoney(currency === 'USDC' ? value : Math.round(value), currency, {
                decimals: currency === 'USDC' ? 2 : undefined,
              })
            }
            style={[styles.amount, { color: colors.accent }]}
          />
          <Reveal delay={700}>
            <AppText variant="body" color="onBrand" align="center" style={styles.summary}>
              is with{' '}
              <AppText variant="subheading" color="onBrand">
                {recipient.name}
              </AppText>
            </AppText>
            <AppText variant="body" color="onBrandMuted" align="center">
              Settled in {seconds} seconds
            </AppText>
          </Reveal>
        </View>

        <View
          style={[
            styles.receipt,
            { backgroundColor: colors.brandInset, borderColor: colors.brandLine },
          ]}
        >
          {rows.map(([label, value, mono], index) => (
            <Reveal
              key={label}
              delay={820 + index * 90}
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
            </Reveal>
          ))}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hero: { alignItems: 'center', marginTop: 56, gap: 8 },
  check: { marginBottom: 18 },
  amount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
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
