import * as Clipboard from 'expo-clipboard';
import { Copy, ExternalLink } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { getUsdcWallet } from '@/features/usdc/usdcApi';
import { groupDigits } from '@/lib/money';
import { useAsyncValue } from '@/lib/useAsyncValue';
import { fonts, useTheme } from '@/theme';

const FAUCET_URL = 'https://faucet.circle.com';

/** Your USDC wallet on Solana's test network: address, balance, and where to get test tokens. */
export default function UsdcWalletScreen() {
  const { colors } = useTheme();
  const load = useCallback(() => getUsdcWallet(), []);
  const { value, error, loading, reload } = useAsyncValue(load);
  const [copied, setCopied] = useState(false);
  const wallet = value?.wallet ?? null;

  const copy = async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [whole = '0', fraction = ''] = (wallet?.usdc ?? '0').split('.');

  return (
    <Screen>
      <Header center={<AppText variant="subheading">USDC wallet</AppText>} />
      <View style={styles.body}>
        {loading && !value ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : error ? (
          <>
            <AppText color="gold">{error}</AppText>
            <Button label="Try again" variant="outline" onPress={reload} />
          </>
        ) : value && !value.configured ? (
          <AppText color="textMuted">
            Dollar wallets aren’t switched on yet. They’ll appear here once they are.
          </AppText>
        ) : wallet ? (
          <>
            <Card tone="brand" padded style={styles.balance}>
              <AppText variant="overline" color="onBrandMuted">
                USDC BALANCE · TEST NETWORK
              </AppText>
              <AppText style={[styles.amount, { color: colors.onBrand }]}>
                {groupDigits(whole)}
                {fraction ? `.${fraction.slice(0, 2).padEnd(2, '0')}` : '.00'}
              </AppText>
            </Card>
            <Card padded style={styles.address}>
              <AppText variant="label" color="textMuted">
                Your address on Solana (test network)
              </AppText>
              <AppText variant="mono" selectable style={styles.mono}>
                {wallet.address}
              </AppText>
              <Button
                label={copied ? 'Copied' : 'Copy address'}
                variant="outline"
                icon={<Copy size={18} color={colors.text} strokeWidth={1.75} />}
                onPress={copy}
              />
            </Card>
            <Button
              label="Get free test USDC"
              variant="outline"
              icon={<ExternalLink size={18} color={colors.text} strokeWidth={1.75} />}
              onPress={() => Linking.openURL(FAUCET_URL).catch(() => undefined)}
            />
            <AppText variant="caption" color="textMuted">
              These are test tokens on Solana’s test network. They have no real value. On the faucet
              choose Solana Devnet and paste your address.
            </AppText>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 20, paddingBottom: 24 },
  loading: { marginTop: 48 },
  balance: { gap: 8 },
  amount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
  address: { gap: 12 },
  mono: { fontSize: 14, lineHeight: 20 },
});
