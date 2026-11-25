import { Keypair } from '@solana/web3.js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDownUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MAX_CONVERT, MIN_CONVERT, type ConvertCurrency, type Quote } from '@shared/convert';

import { SuccessBurst } from '@/components/brand';
import { CountUp, Reveal } from '@/components/motion';
import { Approve } from '@/components/security/Approve';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import {
  CURRENCY_NAME,
  conversionStatus,
  describeRate,
  executeQuote,
  formatMinor,
  getQuote,
  useBalances,
} from '@/features/convert';
import { useWalletUsdc } from '@/features/usdc/useWalletUsdc';
import { sendUsdc, solanaErrorMessage } from '@/features/wallet';
import { friendlyError } from '@/lib/errors';
import { groupDigits } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { fonts, radii, useTheme } from '@/theme';

const QUOTE_DELAY_MS = 500;
const POLL_MS = 2_000;
const POLL_LIMIT = 30;

type Step = { kind: 'form' } | { kind: 'done'; quote: Quote };

/** Convert between naira, dollars and USDC at a quoted rate. */
export default function ConvertScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const balances = useBalances();
  const wallet = useWalletUsdc();
  // Ask Faara can open this with the direction and amount filled in.
  const params = useLocalSearchParams<{ from?: string; amount?: string }>();
  const startFrom: ConvertCurrency = params.from === 'USDC' ? 'USDC' : 'NGN';
  const [from, setFrom] = useState<ConvertCurrency>(startFrom);
  const [to, setTo] = useState<ConvertCurrency>(startFrom === 'NGN' ? 'USDC' : 'NGN');
  const [amountText, setAmountText] = useState(() => {
    const amount = Number(params.amount);
    if (!params.amount || !Number.isFinite(amount) || amount <= 0) return '';
    const [whole = '', fraction] = amount.toFixed(2).replace(/\.00$/, '').split('.');
    return fraction ? `${groupDigits(whole)}.${fraction}` : groupDigits(whole);
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'form' });
  // USDC already sent for a sale that hasn't been credited yet (say the network dropped).
  const [unfinished, setUnfinished] = useState<{ quote: Quote; signature: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const amount = Number(amountText.replace(/,/g, ''));
  const validAmount =
    Number.isFinite(amount) &&
    amount >= MIN_CONVERT[from] &&
    amount <= MAX_CONVERT[from] &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
  const available = from === 'USDC' ? wallet.cents : balances ? balances[from] : null;
  const tooMuch = validAmount && available !== null && Math.round(amount * 100) > available;

  // Price the conversion shortly after the amount or currencies stop changing.
  useEffect(() => {
    if (!validAmount || tooMuch) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setQuoting(true);
      setError(null);
      getQuote(from, to, amount)
        .then((next) => !cancelled && setQuote(next))
        .catch((cause: unknown) => {
          if (cancelled) return;
          setQuote(null);
          setError(
            friendlyError(cause, 'Couldn’t get a rate. Check your connection and try again.'),
          );
        })
        .finally(() => !cancelled && setQuoting(false));
    }, QUOTE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, to, amount, validAmount, tooMuch]);

  // Count down the time the quoted rate holds.
  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [quote]);

  const secondsLeft = quote ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) : 0;
  const currentQuote =
    quote && quote.from === from && quote.to === to && quote.fromMinor === Math.round(amount * 100)
      ? quote
      : null;
  const live = currentQuote !== null && secondsLeft > 0 && !tooMuch && validAmount;

  const swap = () => {
    setQuote(null);
    setFrom(to);
    setTo(from);
  };

  /**
   * Selling USDC: the phone pays it from the person's own wallet into Faara's float (Faara
   * covers the network fee), then Faara checks that payment and credits the naira.
   */
  const sell = async (secretKey: Uint8Array) => {
    if (!currentQuote?.payTo) return;
    let signature: string;
    try {
      signature = await sendUsdc(
        Keypair.fromSecretKey(secretKey),
        currentQuote.payTo,
        currentQuote.fromMinor,
      );
    } catch (cause) {
      throw new Error(solanaErrorMessage(cause));
    }
    await convert(signature);
  };

  const convert = async (signature?: string, quoteToRun: Quote | null = currentQuote) => {
    if (!quoteToRun) return;
    setBusy(true);
    setError(null);
    try {
      let result = await executeQuote(quoteToRun.id, signature);
      setUnfinished(null);
      // The USDC moves on the network, so wait for it to confirm.
      for (let i = 0; result.status === 'pending' && i < POLL_LIMIT; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        result = await conversionStatus(quoteToRun.id);
      }
      void wallet.refresh();
      if (result.status === 'failed') {
        setQuote(null);
        setError('That conversion didn’t go through. Nothing was taken. Try again.');
        return;
      }
      if (result.status === 'pending') {
        setQuote(null);
        setError('Still confirming. Check your balances in a minute.');
        return;
      }
      haptics.success();
      setStep({ kind: 'done', quote: quoteToRun });
    } catch (cause) {
      setQuote(null);
      if (signature) {
        // The USDC has left the wallet: keep what's needed to finish the sale.
        setUnfinished({ quote: quoteToRun, signature });
        setError(
          `Your USDC was sent, but the sale isn’t finished. ${friendlyError(cause, 'Check your connection.')}`,
        );
      } else {
        setError(friendlyError(cause, 'The conversion didn’t go through. Try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === 'done') {
    const done = step.quote;
    return (
      <Screen
        footer={
          <>
            <Button label="Done" onPress={() => router.back()} />
            <Button
              label="Convert more"
              variant="text"
              onPress={() => {
                setStep({ kind: 'form' });
                setQuote(null);
                setAmountText('');
              }}
            />
          </>
        }
      >
        <View style={styles.done}>
          <SuccessBurst size={104} />
          <Reveal delay={240}>
            <AppText variant="title" align="center">
              Converted.
            </AppText>
          </Reveal>
          <CountUp
            value={done.toMinor}
            delay={360}
            format={(value) => formatMinor(Math.round(value), done.to)}
            variant="title"
            color="accentText"
            align="center"
            style={styles.doneAmount}
          />
          <Reveal delay={640}>
            <AppText color="textMuted" align="center">
              from {formatMinor(done.fromMinor, done.from)} · fee{' '}
              {formatMinor(done.feeMinor, done.to)}
            </AppText>
          </Reveal>
        </View>
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
          {unfinished ? (
            <Button
              label="Finish the sale"
              loading={busy}
              onPress={() => void convert(unfinished.signature, unfinished.quote)}
            />
          ) : live && currentQuote?.payTo ? (
            <Approve
              reason={`Sell ${formatMinor(currentQuote.fromMinor, 'USDC')} for ${formatMinor(currentQuote.toMinor, currentQuote.to)}.`}
              onApproved={sell}
            />
          ) : (
            <Button
              label={
                live && currentQuote
                  ? `Convert to ${formatMinor(currentQuote.toMinor, currentQuote.to)}`
                  : quote && secondsLeft === 0
                    ? 'Rate expired. Get a new one'
                    : 'Convert'
              }
              disabled={!live && !(quote && secondsLeft === 0)}
              loading={busy}
              onPress={live ? () => void convert() : () => setQuote(null)}
            />
          )}
          <AppText variant="caption" color="textMuted" align="center">
            Test rates and test USDC. No real money moves yet.
          </AppText>
        </>
      }
    >
      <Header center={<AppText variant="subheading">Convert</AppText>} />
      <View style={styles.body}>
        <CurrencyRow
          label="From"
          value={from}
          caption={available === null ? '…' : `Balance ${formatMinor(available, from)}`}
          captionTone={tooMuch ? 'gold' : 'textMuted'}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap currencies"
          onPress={swap}
          style={[
            styles.swap,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <ArrowDownUp size={18} color={colors.accentText} strokeWidth={1.75} />
        </Pressable>
        <CurrencyRow label="To" value={to} />

        <TextField
          label={`Amount in ${CURRENCY_NAME[from].toLowerCase()}`}
          value={amountText}
          onChangeText={(text) => {
            setQuote(null);
            const cleaned = text.replace(/[^0-9.]/g, '');
            const [whole = '', fraction] = cleaned.split('.');
            setAmountText(
              fraction === undefined
                ? groupDigits(whole.slice(0, 9))
                : `${groupDigits(whole.slice(0, 9))}.${fraction.slice(0, 2)}`,
            );
          }}
          placeholder={from === 'NGN' ? '50,000' : '100'}
          keyboardType="decimal-pad"
          leading={
            <AppText style={[styles.symbol, { color: colors.textMuted }]}>
              {from === 'NGN' ? '₦' : ''}
            </AppText>
          }
          hint={
            <AppText variant="label" color={tooMuch ? 'gold' : 'textMuted'} style={styles.hint}>
              {tooMuch
                ? `That’s more than your ${CURRENCY_NAME[from].toLowerCase()} balance.`
                : `Between ${formatMinor(MIN_CONVERT[from] * 100, from)} and ${formatMinor(MAX_CONVERT[from] * 100, from)}`}
            </AppText>
          }
        />

        <Card tone="brand" padded style={styles.quote}>
          {quoting ? (
            <ActivityIndicator color={colors.accent} />
          ) : currentQuote ? (
            <>
              <AppText variant="overline" color="onBrandMuted">
                YOU GET
              </AppText>
              <AppText style={[styles.quoteAmount, { color: colors.onBrand }]}>
                {formatMinor(currentQuote.toMinor, currentQuote.to)}
              </AppText>
              <View style={[styles.rule, { backgroundColor: colors.brandLine }]} />
              <Line
                label="Rate"
                value={describeRate(currentQuote.rate, currentQuote.from, currentQuote.to)}
              />
              <Line label="Fee" value={formatMinor(currentQuote.feeMinor, currentQuote.to)} />
              <Line
                label="Rate holds for"
                value={secondsLeft > 0 ? `${secondsLeft}s` : 'Expired'}
                tone={secondsLeft > 0 && secondsLeft <= 8 ? 'goldOnBrand' : 'onBrand'}
              />
            </>
          ) : (
            <AppText color="onBrandMuted" align="center">
              Enter an amount to see what you’ll get.
            </AppText>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function CurrencyRow({
  label,
  value,
  caption,
  captionTone = 'textMuted',
}: {
  label: string;
  value: ConvertCurrency;
  caption?: string;
  captionTone?: 'textMuted' | 'gold';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.rowWrap}>
      <View style={styles.rowTop}>
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
        {caption ? (
          <AppText variant="label" color={captionTone}>
            {caption}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.fixed, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="bodyStrong">{CURRENCY_NAME[value]}</AppText>
      </View>
    </View>
  );
}

function Line({
  label,
  value,
  tone = 'onBrand',
}: {
  label: string;
  value: string;
  tone?: 'onBrand' | 'goldOnBrand';
}) {
  return (
    <View style={styles.line}>
      <AppText color="onBrandMuted">{label}</AppText>
      <AppText variant="bodyStrong" color={tone}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, marginTop: 20, paddingBottom: 24 },
  rowWrap: { gap: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  fixed: {
    height: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swap: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { fontFamily: fonts.displayBold, fontSize: 18 },
  hint: { marginLeft: 2 },
  quote: { gap: 10, minHeight: 150, justifyContent: 'center' },
  quoteAmount: { fontFamily: fonts.display, fontSize: 36, lineHeight: 44, letterSpacing: -1.2 },
  rule: { height: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  doneAmount: { fontSize: 40, lineHeight: 48 },
});
