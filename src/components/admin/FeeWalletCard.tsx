import { Keypair } from '@solana/web3.js';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Approve } from '@/components/security/Approve';
import { AppText, Button, Card } from '@/components/ui';
import { getFeeWallet } from '@/features/admin';
import { solanaErrorMessage } from '@/features/wallet';
import { sendSol } from '@/features/wallet/solana';
import { friendlyError, ShowableError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

const LAMPORTS_PER_SOL = 1_000_000_000;
/** Below this the fee wallet can't reliably cover new USDC accounts and fees. */
const LOW_SOL = 0.05;
const TOP_UP_SOL = 1;
const FAUCET_URL = 'https://faucet.solana.com';

/**
 * The wallet Faara pays Solana network fees from. On the test network the free faucet often
 * refuses servers, so an admin can top it up here from their own dollar wallet's SOL.
 */
export function FeeWalletCard() {
  const [wallet, setWallet] = useState<{ address: string; lamports: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    getFeeWallet()
      .then(setWallet)
      .catch((cause: unknown) => setError(friendlyError(cause, 'Couldn’t load the fee wallet.')));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <Card padded>
        <AppText color="gold">{error}</AppText>
      </Card>
    );
  }
  if (!wallet) return null;

  const sol = wallet.lamports / LAMPORTS_PER_SOL;
  const low = sol < LOW_SOL;

  const copy = async () => {
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card padded style={styles.card}>
      <AppText variant="overline" color="textMuted">
        FEE WALLET · TEST NETWORK
      </AppText>
      <AppText variant="title" color={low ? 'gold' : 'text'}>
        {sol.toFixed(4)} SOL
      </AppText>
      <AppText color="textMuted">
        {low
          ? 'Too low. USDC payments, Convert and moves fail until it’s topped up.'
          : 'Faara pays everyone’s network fees from this.'}
      </AppText>
      <AppText variant="mono" selectable>
        {wallet.address}
      </AppText>
      {message ? (
        <AppText variant="label" color="accentText">
          {message}
        </AppText>
      ) : null}
      {funding ? (
        <Approve
          reason={`Send ${TOP_UP_SOL} SOL from your dollar wallet to Faara’s fee wallet.`}
          onApproved={async (secretKey) => {
            try {
              await sendSol(
                Keypair.fromSecretKey(secretKey),
                wallet.address,
                TOP_UP_SOL * LAMPORTS_PER_SOL,
              );
            } catch (cause) {
              throw new ShowableError(solanaErrorMessage(cause));
            }
            haptics.success();
            setFunding(false);
            setMessage(`${TOP_UP_SOL} SOL sent. It may take a few seconds to show.`);
            setTimeout(load, 3000);
          }}
        />
      ) : (
        <View style={styles.actions}>
          <Button
            label={`Send ${TOP_UP_SOL} SOL from my dollar wallet`}
            onPress={() => {
              setMessage(null);
              setFunding(true);
            }}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Button label={copied ? 'Copied' : 'Copy address'} variant="outline" onPress={copy} />
            </View>
            <View style={styles.half}>
              <Button
                label="SOL faucet"
                variant="outline"
                onPress={() => Linking.openURL(FAUCET_URL).catch(() => undefined)}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  actions: { gap: 10, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
