import { useRouter } from 'expo-router';
import { ArrowDownUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  CONVERT_CURRENCIES,
  MAX_CONVERT,
  MIN_CONVERT,
  type ConvertCurrency,
  type Quote,
} from '@shared/convert';

import { SuccessBurst } from '@/components/brand';
import { CountUp, Reveal } from '@/components/motion';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import {
  CURRENCY_NAME,
  describeRate,
  executeQuote,
  formatMinor,
  getQuote,
  useBalances,
} from '@/features/convert';
import { friendlyError } from '@/lib/errors';
import { groupDigits } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { fonts, radii, useTheme } from '@/theme';

const QUOTE_DELAY_MS = 500;

type Step = { kind: 'form' } | { kind: 'done'; quote: Quote };

/** Convert between naira, dollars and USDC at a quoted rate. */
export default function ConvertScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const balances = useBalances();
  const [from, setFrom] = useState<ConvertCurrency>('NGN');
  const [to, setTo] = useState<ConvertCurrency>('USDC');
  const [amountText, setAmountText] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [now, setNow] = useState(() => Date.now());

  const amount = Number(amountText.replace(/,/g, ''));
  const validAmount =
    Number.isFinite(amount) &&
    amount >= MIN_CONVERT[from] &&
    amount <= MAX_CONVERT[from] &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
  const available = balances ? balances[from] : null;
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

  const pick = (side: 'from' | 'to', currency: ConvertCurrency) => {
    setQuote(null);
    if (side === 'from') {
      if (currency === to) setTo(from);
      setFrom(currency);
    } else {
      if (currency === from) setFrom(to);
      setTo(currency);
    }
  };

  const swap = () => {
    setQuote(null);
    setFrom(to);
    setTo(from);
  };

  const convert = async () => {
    if (!currentQuote) return;
    setBusy(true);
    setError(null);
    try {
      await executeQuote(currentQuote.id);
      haptics.success();
      setStep({ kind: 'done', quote: currentQuote });
    } catch (cause) {
      setQuote(null);
      setError(friendlyError(cause, 'The conversion didn’t go through. Try again.'));
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
            onPress={live ? convert : () => setQuote(null)}
          />
          <AppText variant="caption" color="textMuted" align="center">
            Test rates for now. No real money moves yet.
          </AppText>
        </>
      }
    >
      <Header center={<AppText variant="subheading">Convert</AppText>} />
      <View style={styles.body}>
        <CurrencyRow
          label="From"
          value={from}
          onPick={(c) => pick('from', c)}
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
        <CurrencyRow label="To" value={to} onPick={(c) => pick('to', c)} />

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
              {from === 'NGN' ? '₦' : '$'}
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
  onPick,
  caption,
  captionTone = 'textMuted',
}: {
  label: string;
  value: ConvertCurrency;
  onPick: (currency: ConvertCurrency) => void;
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
      <View style={styles.chips}>
        {CONVERT_CURRENCIES.map((currency) => {
          const selected = currency === value;
          return (
            <Pressable
              key={currency}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label} ${CURRENCY_NAME[currency]}`}
              onPress={() => onPick(currency)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <AppText variant="bodyStrong" color={selected ? 'onAccent' : 'text'}>
                {currency}
              </AppText>
            </Pressable>
          );
        })}
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
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
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
