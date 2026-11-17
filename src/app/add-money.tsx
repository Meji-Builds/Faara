import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Copy, CreditCard, Landmark } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { FUNDING_LIMITS } from '@shared/hum';

import {
  AppText,
  Button,
  Card,
  Header,
  ListRow,
  Screen,
  TextField,
  TextTabs,
} from '@/components/ui';
import { useNairaBalance } from '@/features/account';
import { useProfile } from '@/features/auth';
import {
  CHECKOUT_PLATFORM,
  initializeFunding,
  openCheckout,
  verifyFunding,
} from '@/features/funding';
import { DOLLARS_ENABLED } from '@/config/features';
import { faaraNumber } from '@/lib/phone';
import { apiErrorMessage } from '@/lib/api/client';
import { formatMoney, groupDigits } from '@/lib/money';
import { fonts, radii, useTheme } from '@/theme';

type Tab = 'naira' | 'dollars';
const TABS: readonly Tab[] = ['naira', 'dollars'];
const QUICK_AMOUNTS = [1_000, 5_000, 10_000, 20_000];

type Result =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'success'; amount: number }
  | { state: 'pending' }
  | { state: 'failed'; message: string };

/** Add money: naira by card or bank transfer; dollars by receiving USDC. */
export default function AddMoneyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const profile = useProfile();
  const balance = useNairaBalance();
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();
  const [tab, setTab] = useState<Tab>('naira');
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ state: 'idle' });
  const [copied, setCopied] = useState(false);
  const checked = useRef<string | null>(null);

  const amount = Number(amountText.replace(/,/g, ''));
  const valid =
    Number.isInteger(amount) && amount >= FUNDING_LIMITS.min && amount <= FUNDING_LIMITS.max;

  const confirm = useCallback(async (reference: string) => {
    setResult({ state: 'checking' });
    try {
      const outcome = await verifyFunding(reference);
      setResult(
        outcome.status === 'success'
          ? { state: 'success', amount: outcome.amount }
          : outcome.status === 'pending'
            ? { state: 'pending' }
            : { state: 'failed', message: 'The payment didn’t go through. You weren’t charged.' },
      );
    } catch (cause) {
      setResult({ state: 'failed', message: apiErrorMessage(cause) });
    }
  }, []);

  // Web: the payment page returns here with ?reference=…
  const returned = params.reference ?? params.trxref;
  useEffect(() => {
    if (!returned || checked.current === returned) return;
    checked.current = returned;
    confirm(returned);
  }, [returned, confirm]);

  const pay = async () => {
    setBusy(true);
    setResult({ state: 'idle' });
    try {
      const { reference, checkoutUrl } = await initializeFunding(amount, CHECKOUT_PLATFORM);
      await openCheckout(checkoutUrl);
      // App: the in-app browser has closed; see whether the payment went through.
      checked.current = reference;
      await confirm(reference);
    } catch (cause) {
      setResult({ state: 'failed', message: apiErrorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!profile.walletAddress) return;
    await Clipboard.setStringAsync(profile.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen
      footer={
        tab === 'naira' && result.state !== 'success' ? (
          <>
            <Button
              label={valid ? `Add ${formatMoney(amount, 'NGN')}` : 'Add money'}
              disabled={!valid || result.state === 'checking'}
              loading={busy}
              onPress={pay}
            />
            <AppText variant="caption" color="textMuted" align="center">
              You’ll pay on Paystack’s secure page by card or bank transfer.
            </AppText>
          </>
        ) : tab === 'naira' ? (
          <Button label="Done" onPress={() => router.back()} />
        ) : null
      }
    >
      <Header center={<AppText variant="subheading">Add money</AppText>} />
      {DOLLARS_ENABLED ? (
        <View style={styles.tabs}>
          <TextTabs
            options={TABS}
            value={tab}
            onChange={setTab}
            labels={{ naira: 'Naira', dollars: 'Dollars' }}
          />
        </View>
      ) : null}

      {tab === 'naira' ? (
        <View style={styles.body}>
          {result.state === 'success' ? (
            <Card tone="brand" padded style={styles.success}>
              <View style={[styles.check, { backgroundColor: colors.accent }]}>
                <Check size={30} color={colors.onAccent} strokeWidth={3} />
              </View>
              <AppText variant="heading" color="onBrand">
                {formatMoney(result.amount, 'NGN')} added
              </AppText>
              <AppText color="onBrandMuted" align="center">
                New balance {balance === null ? '…' : formatMoney(balance, 'NGN', { decimals: 2 })}
              </AppText>
            </Card>
          ) : (
            <>
              <TextField
                label="Amount"
                value={amountText}
                onChangeText={(text) => {
                  const digits = text.replace(/\D/g, '').slice(0, 7);
                  setAmountText(digits ? groupDigits(String(Number(digits))) : '');
                }}
                placeholder="5,000"
                keyboardType="number-pad"
                leading={<AppText style={[styles.symbol, { color: colors.textMuted }]}>₦</AppText>}
                hint={
                  <AppText variant="label" color="textMuted" style={styles.hint}>
                    Balance {balance === null ? '…' : formatMoney(balance, 'NGN', { decimals: 2 })}{' '}
                    · ₦{groupDigits(String(FUNDING_LIMITS.min))} to ₦
                    {groupDigits(String(FUNDING_LIMITS.max))}
                  </AppText>
                }
              />
              <View style={styles.chips}>
                {QUICK_AMOUNTS.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatMoney(value, 'NGN')}`}
                    onPress={() => setAmountText(groupDigits(String(value)))}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}
                  >
                    <AppText variant="bodyStrong">₦{groupDigits(String(value))}</AppText>
                  </Pressable>
                ))}
              </View>

              {result.state === 'checking' ? (
                <View style={styles.status}>
                  <ActivityIndicator color={colors.accent} />
                  <AppText color="textMuted">Checking your payment…</AppText>
                </View>
              ) : result.state === 'pending' ? (
                <AppText variant="label" color="gold">
                  We haven’t received that payment yet. If you paid by bank transfer it can take a
                  minute; your balance updates by itself when it arrives.
                </AppText>
              ) : result.state === 'failed' ? (
                <AppText variant="label" color="gold">
                  {result.message}
                </AppText>
              ) : null}

              <Card divided style={styles.methods}>
                <ListRow
                  label="Card"
                  icon={<CreditCard size={20} color={colors.accentText} strokeWidth={1.75} />}
                  value="Instant"
                />
                <ListRow
                  label="Bank transfer"
                  icon={<Landmark size={20} color={colors.accentText} strokeWidth={1.75} />}
                  value="A minute or two"
                />
              </Card>
              <Card padded style={styles.account}>
                <AppText variant="label" color="textMuted">
                  Your Faara number
                </AppText>
                <AppText style={styles.accountNumber}>{faaraNumber(profile.phone)}</AppText>
                <AppText variant="caption" color="textMuted">
                  Anyone on Faara can send money to this number. Transfers from other banks will
                  come with our banking partner. Until then, add money with the button below.
                </AppText>
              </Card>
            </>
          )}
        </View>
      ) : (
        <View style={styles.body}>
          <Card padded style={styles.account}>
            <AppText variant="label" color="textMuted">
              Your dollar address (USDC on Solana)
            </AppText>
            <AppText variant="mono" selectable style={styles.address}>
              {profile.walletAddress}
            </AppText>
            <Button
              label={copied ? 'Copied' : 'Copy address'}
              variant="outline"
              icon={<Copy size={18} color={colors.text} strokeWidth={1.75} />}
              onPress={copyAddress}
            />
          </Card>
          <AppText variant="label" color="textMuted">
            Send USDC on the Solana network to this address from any wallet or exchange, and it
            shows in your dollar balance. Only send USDC on Solana: other coins or networks can be
            lost.
          </AppText>
          <Card divided>
            <ListRow label="Dollar wallet and test funds" onPress={() => router.push('/wallet')} />
          </Card>
          <AppText variant="caption" color="textMuted">
            Buying dollars with naira will come through a licensed partner.
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { alignItems: 'center', marginTop: 4 },
  body: { gap: 16, marginTop: 20, paddingBottom: 24 },
  symbol: { fontFamily: fonts.displayBold, fontSize: 18 },
  hint: { marginLeft: 2 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  methods: {},
  account: { gap: 8 },
  accountNumber: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 32, letterSpacing: 2 },
  address: { fontSize: 14, lineHeight: 20 },
  success: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
});
