import * as Clipboard from 'expo-clipboard';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Header, ListRow, OtpField, Screen } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useProfile } from '@/features/auth';
import {
  confirmWithBiometrics,
  getSolBalance,
  getUsdcBalance,
  PIN_LENGTH,
  requestTestSol,
  TEST_FUNDS_LINKS,
  useApproval,
  useWallet,
} from '@/features/wallet';
import { formatMoney } from '@/lib/money';
import { useAsyncValue } from '@/lib/useAsyncValue';
import { fonts, radii, useTheme } from '@/theme';

/** Dollar wallet: address, devnet balances, test funds and the recovery phrase. */
export default function WalletScreen() {
  const { colors } = useTheme();
  const profile = useProfile();
  const address = profile.walletAddress ?? '';
  const { revealPhrase } = useWallet();
  const { biometricsEnabled } = useApproval();

  const loadBalances = useCallback(
    async () => ({ usdc: await getUsdcBalance(address), sol: await getSolBalance(address) }),
    [address],
  );
  const balances = useAsyncValue(loadBalances);

  const [copied, setCopied] = useState(false);
  const [airdrop, setAirdrop] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTestSol = async () => {
    setAirdrop('Requesting test SOL…');
    try {
      await requestTestSol(address);
      setAirdrop('Test SOL is on its way. Refresh in a few seconds.');
      setTimeout(balances.reload, 4000);
    } catch {
      setAirdrop('The network’s free SOL is busy. Use the faucet site instead.');
    }
  };

  const showPhrase = async () => {
    setPinError(null);
    if (biometricsEnabled && (await confirmWithBiometrics('Show your recovery phrase'))) {
      setPhrase(await revealPhrase(null));
      return;
    }
    setAskPin(true);
  };

  const showPhraseWithPin = async () => {
    try {
      setPhrase(await revealPhrase(pin));
      setAskPin(false);
    } catch (cause) {
      setPinError(friendlyError(cause, 'Couldn’t check your PIN. Try again.'));
    } finally {
      setPin('');
    }
  };

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Dollar wallet</AppText>} />

      <Card tone="brand" padded style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <AppText variant="bodyStrong" color="onBrandMuted">
            USDC on Solana (devnet)
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh balances"
            onPress={balances.reload}
            hitSlop={12}
          >
            <RefreshCw size={20} color={colors.onBrandMuted} strokeWidth={1.75} />
          </Pressable>
        </View>
        <AppText style={[styles.balance, { color: colors.goldOnBrand }]}>
          {balances.value
            ? formatMoney(balances.value.usdc, 'USDC', { decimals: 2 })
            : balances.loading
              ? '…'
              : '—'}
        </AppText>
        <AppText variant="label" color="onBrandMuted">
          {balances.value
            ? `${balances.value.sol.toFixed(4)} SOL for network fees`
            : (balances.error ?? ' ')}
        </AppText>
      </Card>

      <Card padded style={styles.addressCard}>
        <AppText variant="label" color="textMuted">
          Your address
        </AppText>
        <AppText variant="mono" selectable style={styles.address}>
          {address}
        </AppText>
        <View style={styles.row}>
          <Button
            label={copied ? 'Copied' : 'Copy'}
            variant="outline"
            icon={<Copy size={18} color={colors.text} strokeWidth={1.75} />}
            onPress={copy}
            style={styles.flex}
          />
          <Button
            label="Explorer"
            variant="outline"
            icon={<ExternalLink size={18} color={colors.text} strokeWidth={1.75} />}
            onPress={() =>
              Linking.openURL(`https://explorer.solana.com/address/${address}?cluster=devnet`)
            }
            style={styles.flex}
          />
        </View>
      </Card>

      <AppText variant="overline" color="textMuted" style={styles.section}>
        TEST FUNDS (DEVNET)
      </AppText>
      <Card divided>
        <ListRow label="Get test SOL" value="For fees" onPress={getTestSol} />
        <ListRow label="SOL faucet website" onPress={() => Linking.openURL(TEST_FUNDS_LINKS.sol)} />
        <ListRow
          label="Get test USDC"
          value="Circle faucet"
          onPress={() => Linking.openURL(TEST_FUNDS_LINKS.usdc)}
        />
      </Card>
      {airdrop ? (
        <AppText variant="label" color="textMuted" style={styles.note}>
          {airdrop}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted" style={styles.note}>
        On the Circle faucet choose Solana Devnet and paste your address. Sending USDC needs a
        little SOL for the network fee.
      </AppText>

      <AppText variant="overline" color="textMuted" style={styles.section}>
        RECOVERY PHRASE
      </AppText>
      {phrase ? (
        <Card padded style={styles.phraseCard}>
          <View style={styles.words}>
            {phrase.split(' ').map((word, index) => (
              <View key={index} style={[styles.word, { backgroundColor: colors.surfaceMuted }]}>
                <AppText variant="mono" color="textMuted">
                  {index + 1}
                </AppText>
                <AppText variant="mono">{word}</AppText>
              </View>
            ))}
          </View>
          <AppText variant="label" color="gold">
            Anyone with these words controls your dollars. Write them down and never share them.
          </AppText>
          <Button label="Hide" variant="text" onPress={() => setPhrase(null)} />
        </Card>
      ) : askPin ? (
        <Card padded style={styles.phraseCard}>
          <AppText variant="label" color="textMuted">
            Enter your PIN to show your recovery phrase
          </AppText>
          <OtpField
            value={pin}
            onChangeText={setPin}
            length={PIN_LENGTH}
            secure
            autoFocus
            accessibilityLabel="PIN"
          />
          {pinError ? (
            <AppText variant="label" color="gold">
              {pinError}
            </AppText>
          ) : null}
          <Button
            label="Show phrase"
            disabled={pin.length !== PIN_LENGTH}
            onPress={showPhraseWithPin}
          />
        </Card>
      ) : (
        <Card divided>
          <ListRow label="Show recovery phrase" onPress={showPhrase} />
        </Card>
      )}
      <View style={styles.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { marginTop: 16, gap: 6 },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balance: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
  addressCard: { marginTop: 16, gap: 10 },
  address: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, height: 48 },
  section: { marginTop: 24, marginBottom: 10 },
  note: { marginTop: 10 },
  phraseCard: { gap: 14 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    minWidth: '30%',
  },
  bottom: { height: 24 },
});
