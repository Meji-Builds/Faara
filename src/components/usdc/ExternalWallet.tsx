import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SOLANA_ADDRESS_PATTERN, explorerTxUrl } from '@shared/solana';

import { Approve } from '@/components/security/Approve';
import { AppText, Button, Card, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { randomId } from '@/features/offline';
import {
  MOBILE_WALLETS_SUPPORTED,
  connectMobileWallet,
  depositFromMobileWallet,
  loadConnectedWallet,
  saveConnectedWallet,
  withdrawUsdc,
  withdrawalState,
  type ConnectedWallet,
} from '@/features/solanaMobile';
import { getUsdcBalance } from '@/features/wallet/solana';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

type Mode = 'deposit' | 'withdraw' | null;

interface ExternalWalletProps {
  /** The person's Faara USDC address (where deposits go). */
  faaraAddress: string;
  /** USDC in the Faara wallet, in cents. */
  faaraCents: number;
  /** Called after money moves, so the Faara balance can be reloaded. */
  onChanged: () => void;
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const POLL_MS = 2_000;
const POLL_LIMIT = 30;

/**
 * The person's own Solana wallet (Phantom, Solflare, Seed Vault…): connect it with Mobile
 * Wallet Adapter, add USDC from it, or send USDC to it (or to any address on the web).
 */
export function ExternalWallet({ faaraAddress, faaraCents, onChanged }: ExternalWalletProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [amountText, setAmountText] = useState('');
  const [addressText, setAddressText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; link?: string } | null>(null);

  useEffect(() => {
    if (!uid) return;
    void loadConnectedWallet(uid).then(setWallet);
  }, [uid]);

  useEffect(() => {
    if (!wallet) return;
    getUsdcBalance(wallet.address)
      .then(setWalletUsdc)
      .catch(() => setWalletUsdc(null));
  }, [wallet, message]);

  const cents = Math.round(Number(amountText || '0') * 100);
  const destination = wallet?.address ?? addressText.trim();
  const validDestination = SOLANA_ADDRESS_PATTERN.test(destination) && destination !== faaraAddress;
  const limit =
    mode === 'deposit' ? (walletUsdc === null ? 0 : Math.floor(walletUsdc * 100)) : faaraCents;
  const validAmount = cents > 0 && cents <= limit;

  const reset = () => {
    setMode(null);
    setAmountText('');
  };

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const connected = await connectMobileWallet();
      await saveConnectedWallet(uid, connected);
      setWallet(connected);
      haptics.success();
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The wallet didn’t connect. Try again.') });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await saveConnectedWallet(uid, null);
    setWallet(null);
    setWalletUsdc(null);
    reset();
  };

  const deposit = async () => {
    if (!wallet) return;
    setBusy(true);
    setMessage(null);
    try {
      const signature = await depositFromMobileWallet(wallet, faaraAddress, cents);
      haptics.success();
      setMessage({
        text: `${(cents / 100).toFixed(2)} USDC is on its way to Faara.`,
        link: explorerTxUrl(signature),
      });
      reset();
      setTimeout(onChanged, 4_000);
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The wallet didn’t send it. Nothing moved.') });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const requestId = randomId('WD');
    await withdrawUsdc(destination, cents, requestId);
    let state: 'pending' | 'done' | 'failed' = 'pending';
    for (let i = 0; state === 'pending' && i < POLL_LIMIT; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      state = (await withdrawalState(requestId)).state;
    }
    if (state === 'failed') throw new Error('The transfer didn’t go through. Nothing was taken.');
    haptics.success();
    setMessage({
      text:
        state === 'done'
          ? `${(cents / 100).toFixed(2)} USDC sent to ${short(destination)}.`
          : 'Sent. It’s still confirming on the network.',
    });
    reset();
    onChanged();
  };

  return (
    <Card padded style={styles.card}>
      <View style={styles.top}>
        <Wallet size={18} color={colors.textMuted} strokeWidth={1.75} />
        <AppText variant="label" color="textMuted">
          Your own Solana wallet
        </AppText>
      </View>

      {wallet ? (
        <View style={styles.row}>
          <View>
            <AppText variant="bodyStrong">{wallet.label}</AppText>
            <AppText variant="mono" color="textMuted">
              {short(wallet.address)}
            </AppText>
          </View>
          <AppText variant="bodyStrong">
            {walletUsdc === null ? '…' : `${walletUsdc.toFixed(2)} USDC`}
          </AppText>
        </View>
      ) : (
        <AppText color="textMuted">
          {MOBILE_WALLETS_SUPPORTED
            ? 'Connect Phantom, Solflare or Seed Vault to move USDC in and out of Faara.'
            : 'Send USDC from Faara to any Solana address. Connecting a wallet works in the Android app.'}
        </AppText>
      )}

      {message ? (
        <View style={styles.message}>
          <AppText variant="label" color="accentText">
            {message.text}
          </AppText>
          {message.link ? (
            <Button
              label="View on the network"
              variant="text"
              onPress={() => Linking.openURL(message.link ?? '').catch(() => undefined)}
            />
          ) : null}
        </View>
      ) : null}

      {mode ? (
        <View style={styles.form}>
          {mode === 'withdraw' && !wallet ? (
            <TextField
              label="Send to (Solana address)"
              value={addressText}
              onChangeText={setAddressText}
              placeholder="Paste an address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <TextField
            label="Amount in USDC"
            value={amountText}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9.]/g, '');
              const [whole = '', fraction] = cleaned.split('.');
              setAmountText(
                fraction === undefined
                  ? whole.slice(0, 5)
                  : `${whole.slice(0, 5)}.${fraction.slice(0, 2)}`,
              );
            }}
            placeholder="5.00"
            keyboardType="decimal-pad"
            hint={
              <AppText variant="label" color={cents > limit ? 'gold' : 'textMuted'}>
                Up to {(limit / 100).toFixed(2)} USDC
              </AppText>
            }
          />
          {mode === 'deposit' ? (
            <Button
              label={validAmount ? `Add ${(cents / 100).toFixed(2)} USDC` : 'Add USDC'}
              disabled={!validAmount}
              loading={busy}
              onPress={deposit}
            />
          ) : validAmount && validDestination ? (
            <Approve
              reason={`Send ${(cents / 100).toFixed(2)} USDC to ${short(destination)}.`}
              onApproved={async () => withdraw()}
            />
          ) : (
            <Button label="Send USDC" disabled />
          )}
          <Button label="Cancel" variant="text" onPress={reset} />
        </View>
      ) : (
        <View style={styles.actions}>
          {wallet ? (
            <Button
              label="Add from wallet"
              icon={<ArrowDownLeft size={18} color={colors.onAccent} strokeWidth={1.75} />}
              onPress={() => setMode('deposit')}
            />
          ) : MOBILE_WALLETS_SUPPORTED ? (
            <Button label="Connect a wallet" loading={busy} onPress={connect} />
          ) : null}
          <Button
            label={wallet ? 'Send to wallet' : 'Send to an address'}
            variant="outline"
            icon={<ArrowUpRight size={18} color={colors.accentText} strokeWidth={1.75} />}
            disabled={faaraCents === 0}
            onPress={() => setMode('withdraw')}
          />
          {wallet ? <Button label="Disconnect" variant="text" onPress={disconnect} /> : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  message: { gap: 4 },
  form: { gap: 12 },
  actions: { gap: 10 },
});
