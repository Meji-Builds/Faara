import { useLocalSearchParams, useRouter } from 'expo-router';
import { Download, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { PaymentCheck } from '@shared/ai';
import { nationalPhone, type CreateTransferResponse, type LookupUserResponse } from '@shared/hum';

import { SuccessBurst } from '@/components/brand';
import { CountUp, Reveal } from '@/components/motion';
import { RiskBanner } from '@/components/assistant';
import { ApprovalFooter, PaymentDetails, PaymentHeader } from '@/components/payments';
import { checkPayment } from '@/features/assistant';
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
import { DOLLARS_ENABLED } from '@/config/features';
import { apiErrorMessage } from '@/lib/api/client';
import { haptics } from '@/lib/haptics';
import { formatMoney, initials, type Currency } from '@/lib/money';
import { fonts, palette, useTheme } from '@/theme';

const CURRENCIES: readonly Currency[] = ['NGN', 'USDC'];
const LOOKUP_DELAY_MS = 450;

/** `key` is what was looked up: a username, or "tel:" and the phone's national digits. */
type Lookup =
  | { state: 'idle' }
  | { state: 'searching'; key: string }
  | { state: 'found'; key: string; user: LookupUserResponse }
  | { state: 'missing'; key: string; message: string };

/** Parses typed amounts like "12,500" or "40.5". Naira must be whole. */
function parseAmount(text: string, currency: Currency): number | null {
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (currency === 'NGN' && !Number.isInteger(value)) return null;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return null;
  return value;
}

/** Send to someone by username or phone number, without being nearby. */
export default function SendScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const me = useProfile();
  const naira = useNairaBalance();
  const usdc = useUsdcBalance().value;

  const params = useLocalSearchParams<{ to?: string; amount?: string; note?: string }>();
  const [recipientInput, setRecipientInput] = useState(params.to ?? '');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [currency, setCurrency] = useState<Currency>('NGN');
  // Ask Faara can fill these in; the person still reviews and approves.
  const [amountText, setAmountText] = useState(
    params.amount && /^\d+(\.\d{1,2})?$/.test(params.amount) ? params.amount : '',
  );
  const [note, setNote] = useState((params.note ?? '').slice(0, 100));
  const [risk, setRisk] = useState<PaymentCheck | null>(null);
  const [transfer, setTransfer] = useState<CreateTransferResponse | null>(null);
  const [claim, setClaim] = useState<HumClaim | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anything starting with a digit or "+" is a phone number (the person's Faara number);
  // everything else is a username.
  const typed = recipientInput.trim();
  const isPhone = /^[+\d]/.test(typed);
  const typedPhone = isPhone ? nationalPhone(typed) : null;
  const typedUsername = isPhone ? '' : typed.replace(/^@/, '').toLowerCase();
  const myNumber = nationalPhone(me.phone);
  const isSelf = isPhone
    ? typedPhone !== null && typedPhone === myNumber
    : typedUsername === me.username;
  const lookupKey = isSelf
    ? null
    : isPhone
      ? typedPhone && `tel:${typedPhone}`
      : /^[a-z0-9._]{3,20}$/.test(typedUsername)
        ? typedUsername
        : null;

  // Debounced lookup as the recipient is typed.
  useEffect(() => {
    if (!lookupKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLookup({ state: 'searching', key: lookupKey });
      lookupUser(
        lookupKey.startsWith('tel:') ? { phone: lookupKey.slice(4) } : { username: lookupKey },
      )
        .then((user) => !cancelled && setLookup({ state: 'found', key: lookupKey, user }))
        .catch(
          (cause: unknown) =>
            !cancelled &&
            setLookup({ state: 'missing', key: lookupKey, message: apiErrorMessage(cause) }),
        );
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lookupKey]);

  useEffect(() => {
    if (settlement) haptics.success();
  }, [settlement]);

  // Live safety badge for the recipient once the payment exists.
  useEffect(() => {
    if (!transfer) return;
    return watchClaim(transfer.paymentId, transfer.claimId, setClaim);
  }, [transfer]);

  const recipient = lookup.state === 'found' && lookup.key === lookupKey ? lookup.user : null;
  const amount = parseAmount(amountText, currency);
  const available = currency === 'NGN' ? naira : usdc;
  const overBalance = amount !== null && available !== null && amount > available;
  const needsWallet = currency === 'USDC' && recipient !== null && !recipient.hasWallet;
  const amountLabel =
    amount === null
      ? ''
      : formatMoney(amount, currency, { decimals: currency === 'USDC' ? 2 : undefined });
  const canContinue =
    recipient !== null && amount !== null && !overBalance && !needsWallet && lookupKey !== null;

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
    setRisk(null);
    try {
      setTransfer(await createTransfer(recipient.username, amount, currency, note.trim()));
      // The scam guard looks at the payment while it is being reviewed. It only advises:
      // a failed check never blocks paying.
      if (currency === 'NGN') {
        checkPayment(recipient.username, Math.round(amount * 100), note.trim())
          .then(setRisk)
          .catch(() => undefined);
      }
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
          <View style={styles.check}>
            <SuccessBurst size={104} />
          </View>
          <Reveal delay={260}>
            <AppText
              style={[styles.doneTitle, { color: colors.onBrand }]}
              accessibilityRole="header"
            >
              Sent.
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
            style={[styles.doneAmount, { color: colors.accent }]}
          />
          <Reveal delay={700}>
            <AppText color="onBrand" align="center">
              is with{' '}
              <AppText variant="bodyStrong" color="onBrand">
                {transfer.recipient.fullName}
              </AppText>
            </AppText>
            <AppText variant="label" color="onBrandMuted" align="center">
              Settled in {(settlement.elapsedMs / 1000).toFixed(1)} seconds · {reference}
            </AppText>
          </Reveal>
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
        {risk && risk.level !== 'ok' ? (
          <RiskBanner level={risk.level} title={risk.title} reason={risk.reason} />
        ) : null}
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
          value={recipientInput}
          onChangeText={(text) => setRecipientInput(text.toLowerCase())}
          placeholder="Username or phone number"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!params.to}
          accessibilityLabel="Username or phone number"
        />
        <RecipientPreview lookup={lookup} lookupKey={lookupKey} isSelf={isSelf} colors={colors} />

        {DOLLARS_ENABLED ? (
          <View style={styles.tabs}>
            <TextTabs options={CURRENCIES} value={currency} onChange={setCurrency} />
          </View>
        ) : null}
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
  lookupKey,
  isSelf,
  colors,
}: {
  lookup: Lookup;
  lookupKey: string | null;
  isSelf: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  if (isSelf) {
    return (
      <AppText variant="label" color="gold">
        That’s you. Enter someone else’s username or number.
      </AppText>
    );
  }
  if (lookup.state === 'idle' || lookup.key !== lookupKey) return null;
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
  check: { marginBottom: 14 },
  doneAmount: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: -1.5 },
  doneTitle: { fontFamily: fonts.display, fontSize: 48, lineHeight: 56, letterSpacing: -2 },
});
