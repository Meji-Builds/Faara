import { useRouter } from 'expo-router';
import { Check, Download, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { CreateTransferResponse, LookupUserResponse } from '@shared/hum';

import { ApprovalFooter, PaymentDetails, PaymentHeader } from '@/components/payments';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Header,
  Screen,
  TextField,
  TextTabs,
} from '@/components/ui';
import { useNairaBalance, useUsdcBalance } from '@/features/account';
import { useProfile } from '@/features/auth';
import { cancelHum, watchClaim, type HumClaim } from '@/features/hum';
import {
  createTransfer,
  lookupUser,
  usePayFlow,
  type PaymentToSettle,
  type Settlement,
} from '@/features/payments';
import { receiptReference } from '@/features/receipts';
import { apiErrorMessage } from '@/lib/api/client';
import { formatMoney, initials, type Currency } from '@/lib/money';
import { fonts, palette, useTheme } from '@/theme';

const CURRENCIES: readonly Currency[] = ['NGN', 'USDC'];
const LOOKUP_DELAY_MS = 450;

type Lookup =
  | { state: 'idle' }
  | { state: 'searching'; username: string }
  | { state: 'found'; username: string; user: LookupUserResponse }
  | { state: 'missing'; username: string; message: string };

/** Parses typed amounts like "12,500" or "40.5". Naira must be whole. */
function parseAmount(text: string, currency: Currency): number | null {
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (currency === 'NGN' && !Number.isInteger(value)) return null;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return null;
  return value;
}

/** Send to someone by username, without being nearby. */
export default function SendScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useProfile();
  const naira = useNairaBalance();
  const usdc = useUsdcBalance().value;

  const [username, setUsername] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [transfer, setTransfer] = useState<CreateTransferResponse | null>(null);
  const [claim, setClaim] = useState<HumClaim | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();
  const usernameValid = /^[a-z0-9._]{3,20}$/.test(cleanUsername) && cleanUsername !== me.username;

  // Debounced lookup as the username is typed.
  useEffect(() => {
    if (!usernameValid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLookup({ state: 'searching', username: cleanUsername });
      lookupUser(cleanUsername)
        .then((user) => !cancelled && setLookup({ state: 'found', username: cleanUsername, user }))
        .catch(
          (cause: unknown) =>
            !cancelled &&
            setLookup({
              state: 'missing',
              username: cleanUsername,
              message: apiErrorMessage(cause),
            }),
        );
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanUsername, usernameValid]);

  // Live safety badge for the recipient once the payment exists.
  useEffect(() => {
    if (!transfer) return;
    return watchClaim(transfer.paymentId, transfer.claimId, setClaim);
  }, [transfer]);

  const recipient =
    lookup.state === 'found' && lookup.username === cleanUsername ? lookup.user : null;
  const amount = parseAmount(amountText, currency);
  const available = currency === 'NGN' ? naira : usdc;
  const overBalance = amount !== null && available !== null && amount > available;
  const needsWallet = currency === 'USDC' && recipient !== null && !recipient.hasWallet;
  const amountLabel =
    amount === null
      ? ''
      : formatMoney(amount, currency, { decimals: currency === 'USDC' ? 2 : undefined });
  const canContinue =
    recipient !== null && amount !== null && !overBalance && !needsWallet && usernameValid;

  const payment = useMemo<PaymentToSettle | null>(
    () =>
      transfer && amount !== null
        ? {
            paymentId: transfer.paymentId,
            currency,
            amountMinor: Math.round(amount * 100),
            recipientWallet: transfer.recipient.walletAddress,
            approvalReason: `Send ${amountLabel} to ${transfer.recipient.fullName}`,
          }
        : null,
    [transfer, amount, currency, amountLabel],
  );
  const onSettled = useCallback((result: Settlement) => setSettlement(result), []);
  const flow = usePayFlow(payment, onSettled);

  const review = async () => {
    if (!recipient || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      setTransfer(await createTransfer(recipient.username, amount, currency, note.trim()));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const backToForm = () => {
    if (transfer) cancelHum(transfer.paymentId).catch(() => undefined);
    setTransfer(null);
    setClaim(null);
  };

  // Done: payment settled.
  if (transfer && settlement && amount !== null) {
    const reference = receiptReference(transfer.paymentId);
    return (
      <Screen
        background={colors.brand}
        lightStatusBar
        footer={
          <View style={styles.actions}>
            <Button
              label="Receipt"
              variant="outline"
              tone="accent"
              icon={<Download size={20} color={palette.electricTeal} strokeWidth={1.75} />}
              onPress={() =>
                router.push({
                  pathname: '/receipt/[paymentId]',
                  params: { paymentId: transfer.paymentId },
                })
              }
              style={styles.flex}
            />
            <Button label="Done" onPress={() => router.back()} style={styles.flex} />
          </View>
        }
      >
        <View style={styles.done}>
          <View style={[styles.check, { backgroundColor: colors.accent }]}>
            <Check size={48} color={palette.nearBlack} strokeWidth={3} />
          </View>
          <AppText style={[styles.doneTitle, { color: colors.onBrand }]} accessibilityRole="header">
            Sent.
          </AppText>
          <AppText color="onBrand" align="center">
            {amountLabel} is with{' '}
            <AppText variant="bodyStrong" color="onBrand">
              {transfer.recipient.fullName}
            </AppText>
          </AppText>
          <AppText variant="label" color="onBrandMuted" align="center">
            Settled in {(settlement.elapsedMs / 1000).toFixed(1)} seconds · {reference}
          </AppText>
        </View>
      </Screen>
    );
  }

  // Review and approve.
  if (transfer && amount !== null) {
    return (
      <Screen
        footer={
          <ApprovalFooter
            flow={flow}
            amountLabel={amountLabel}
            currency={currency}
            secondary={
              <Button
                label="Change details"
                variant="text"
                disabled={flow.stage === 'paying'}
                onPress={backToForm}
              />
            }
          />
        }
      >
        <Header onBack={backToForm} center={<AppText variant="subheading">Review</AppText>} />
        <PaymentHeader
          recipientName={transfer.recipient.fullName}
          amount={amount}
          currency={currency}
          note={note.trim()}
        />
        <AppText variant="label" color="textMuted" align="center" style={styles.username}>
          @{transfer.recipient.username}
        </AppText>
        <PaymentDetails safety={claim?.safety ?? null} style={styles.details} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          <Button
            label={amount !== null && recipient ? `Review ${amountLabel}` : 'Continue'}
            disabled={!canContinue}
            loading={busy}
            onPress={review}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">Send</AppText>} />

      <View style={styles.form}>
        <TextField
          label="To"
          value={username}
          onChangeText={(text) => setUsername(text.replace(/\s/g, '').toLowerCase())}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          leading={
            <AppText variant="subheading" color="textMuted">
              @
            </AppText>
          }
        />
        <RecipientPreview
          lookup={lookup}
          username={cleanUsername}
          isSelf={cleanUsername === me.username}
          colors={colors}
        />

        <View style={styles.tabs}>
          <TextTabs options={CURRENCIES} value={currency} onChange={setCurrency} />
        </View>
        <TextField
          label="Amount"
          value={amountText}
          onChangeText={(text) => setAmountText(text.replace(/[^0-9.,]/g, ''))}
          placeholder={currency === 'NGN' ? '5,000' : '10.00'}
          keyboardType="decimal-pad"
          leading={
            <AppText style={[styles.symbol, { color: colors.textMuted }]}>
              {currency === 'NGN' ? '₦' : '$'}
            </AppText>
          }
          hint={
            <AppText variant="label" color={overBalance ? 'gold' : 'textMuted'} style={styles.hint}>
              {overBalance
                ? `That's more than your ${currency === 'NGN' ? 'naira' : 'USDC'} balance.`
                : available === null
                  ? 'Checking balance…'
                  : `Balance ${formatMoney(available, currency, { decimals: 2 })}`}
            </AppText>
          }
        />
        {needsWallet ? (
          <AppText variant="label" color="gold">
            {recipient?.fullName} hasn’t set up a dollar wallet yet. Send naira instead.
          </AppText>
        ) : null}
        <TextField
          label="What's it for? (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Rent share"
          maxLength={60}
        />
      </View>
    </Screen>
  );
}

function RecipientPreview({
  lookup,
  username,
  isSelf,
  colors,
}: {
  lookup: Lookup;
  username: string;
  isSelf: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  if (isSelf) {
    return (
      <AppText variant="label" color="gold">
        That’s you. Enter someone else’s username.
      </AppText>
    );
  }
  if (lookup.state === 'idle' || lookup.username !== username) return null;
  if (lookup.state === 'searching')
    return <ActivityIndicator color={colors.accent} style={styles.searching} />;
  if (lookup.state === 'missing') {
    return (
      <AppText variant="label" color="gold">
        {lookup.message}
      </AppText>
    );
  }
  return (
    <Card padded style={styles.recipient}>
      <Avatar size={44} initials={initials(lookup.user.fullName)} />
      <View style={styles.flex}>
        <AppText variant="subheading">{lookup.user.fullName}</AppText>
        <AppText variant="body" color="textMuted">
          @{lookup.user.username}
        </AppText>
      </View>
      <UserRound size={20} color={colors.accentText} strokeWidth={1.75} />
    </Card>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18, marginTop: 20, paddingBottom: 24 },
  tabs: { alignItems: 'flex-start' },
  symbol: { fontFamily: fonts.displayBold, fontSize: 18 },
  hint: { marginLeft: 2 },
  searching: { alignSelf: 'flex-start' },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  flex: { flex: 1 },
  username: { marginTop: 4 },
  details: { marginTop: 24, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  check: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  doneTitle: { fontFamily: fonts.display, fontSize: 48, lineHeight: 56, letterSpacing: -2 },
});
