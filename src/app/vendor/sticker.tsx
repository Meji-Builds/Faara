import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { SOLANA_CLUSTER, solanaPayUrl } from '@shared/solana';
import type { TillResponse } from '@shared/vendors';

import { HumMark, Wordmark } from '@/components/brand';
import { AppText, Button, Header, Screen } from '@/components/ui';
import { DOLLARS_ENABLED } from '@/config/features';
import { useAuth } from '@/features/auth';
import { getTill } from '@/features/vendors';
import { apiErrorMessage } from '@/lib/api/client';
import { payLink } from '@/lib/links';
import { palette, radii, useTheme } from '@/theme';

/**
 * A sticker for the counter: the shop's name and a QR code that opens a payment to it. For
 * customers whose phone can't hear the till, or who don't have Faara yet.
 */
export default function StickerScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const sticker = useRef<ComponentRef<typeof View>>(null);
  const [till, setTill] = useState<TillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    AsyncStorage.getItem(`faara.till.v1.${uid}`)
      .then((saved) => saved && !cancelled && setTill(JSON.parse(saved) as TillResponse))
      .catch(() => undefined);
    getTill()
      .then((fresh) => !cancelled && setTill(fresh))
      .catch((cause: unknown) => !cancelled && setError(apiErrorMessage(cause)));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const share = async () => {
    if (!sticker.current || !till) return;
    setSharing(true);
    setError(null);
    try {
      const uri = await captureRef(sticker, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: `${till.businessName} Faara sticker`,
      });
    } catch {
      setError('Couldn’t save the sticker. Take a screenshot instead.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen
      footer={
        Platform.OS === 'web' ? (
          <AppText variant="label" color="textMuted" align="center">
            Take a screenshot to print it.
          </AppText>
        ) : (
          <Button label="Save or print" loading={sharing} disabled={!till} onPress={share} />
        )
      }
    >
      <Header center={<AppText variant="subheading">Shop sticker</AppText>} />
      {till ? (
        <View style={styles.body}>
          <View
            ref={sticker}
            collapsable={false}
            style={[styles.sticker, { backgroundColor: palette.deepGreen }]}
          >
            <Wordmark size={30} color={palette.text} />
            <AppText variant="subheading" align="center" style={styles.onDark}>
              {till.businessName}
            </AppText>
            <View style={styles.qr}>
              <QRCode
                value={payLink(till.username)}
                size={220}
                ecl="M"
                color={palette.deepGreen}
                backgroundColor="#FFFFFF"
              />
            </View>
            <View style={styles.how}>
              <HumMark size={18} color={palette.electricTeal} />
              <AppText variant="bodyStrong" style={styles.onDark}>
                Open Faara and tap Hum, or scan
              </AppText>
            </View>
            <AppText variant="label" style={styles.muted}>
              @{till.username} · Verified Faara vendor
            </AppText>
            {DOLLARS_ENABLED && till.walletAddress ? (
              <View style={[styles.solana, { borderColor: palette.softTeal }]}>
                <View style={styles.smallQr}>
                  <QRCode
                    value={solanaPayUrl(till.walletAddress, till.businessName)}
                    size={92}
                    ecl="M"
                    color={palette.deepGreen}
                    backgroundColor="#FFFFFF"
                  />
                </View>
                <View style={styles.solanaText}>
                  <AppText variant="bodyStrong" style={styles.onDark}>
                    Paying in USDC?
                  </AppText>
                  <AppText variant="label" style={styles.muted}>
                    Scan with any Solana wallet (Solana Pay)
                    {SOLANA_CLUSTER === 'devnet' ? ' · test network' : ''}
                  </AppText>
                </View>
              </View>
            ) : null}
          </View>
          <AppText color="textMuted" align="center">
            Print it and put it where customers pay. Scanning it opens a payment to your shop, even
            for people who don’t have Faara yet.
          </AppText>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          {error ? (
            <AppText color="gold" align="center">
              {error}
            </AppText>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  sticker: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: radii.xl,
  },
  qr: { padding: 14, borderRadius: radii.lg, backgroundColor: '#FFFFFF' },
  how: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onDark: { color: palette.text },
  muted: { color: palette.softTeal },
  solana: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  smallQr: { padding: 6, borderRadius: radii.md, backgroundColor: '#FFFFFF' },
  solanaText: { flex: 1, gap: 2 },
});
