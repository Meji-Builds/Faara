import { useIsFocused, useRouter } from 'expo-router';
import { ScanLine, ShieldCheck, Store } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AdireBand, HumMark, Rings, Wordmark } from '@/components/brand';
import { CurrencyToggle } from '@/components/hum';
import { AppText, Button, Header, Keypad, Screen, TextField } from '@/components/ui';
import { DOLLARS_ENABLED } from '@/config/features';
import { useNairaBalance, useUsdcBalance } from '@/features/account';
import { useHumDraft } from '@/features/hum';
import { audioEngine } from '@/features/sound';
import { useNearbyShops, type NearbyShop } from '@/features/vendors';
import { useOnline } from '@/lib/connectivity';
import { applyKeypadInput, CURRENCY_SYMBOL, formatMoney, groupDigits } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

/** Shrinks the amount as it grows so it always fits on one line. */
function amountFontSize(characters: number): number {
  if (characters <= 7) return 60;
  return Math.max(34, 60 - (characters - 7) * 6);
}

export default function AmountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { currency, amountInput, amount, note, setCurrency, setAmountInput, setNote } =
    useHumDraft();

  const display = groupDigits(amountInput);
  const fontSize = amountFontSize(display.length + 1);
  const naira = useNairaBalance();
  const usdc = useUsdcBalance().value;
  const available = currency === 'NGN' ? naira : usdc;
  const exceedsBalance = available !== null && amount > available;

  // Shops whose tills this phone can hear. Paying one is a normal payment to that shop, so
  // any number of customers can pay it at the same time.
  const focused = useIsFocused();
  const online = useOnline();
  // The shop's phone hums and this phone listens. Phones listen by themselves; browsers only
  // allow the microphone after a tap, so there the customer taps "Paying a shop?" first.
  const [listenOnWeb, setListenOnWeb] = useState(false);
  const findingShops = focused && online && (Platform.OS !== 'web' || listenOnWeb);
  const shops = useNearbyShops(findingShops);
  const [chosen, setChosen] = useState<NearbyShop | null>(null);
  const shop = chosen && shops.some((s) => s.code === chosen.code) ? chosen : null;

  return (
    <Screen
      footer={
        shop ? (
          <>
            <Button
              label={`Pay ${shop.businessName}`}
              disabled={amount <= 0 || exceedsBalance || currency !== 'NGN'}
              onPress={() =>
                router.push({
                  pathname: '/send',
                  params: { to: shop.username, amount: amountInput, note },
                })
              }
            />
            <AppText variant="label" color="textMuted" align="center">
              {currency === 'NGN'
                ? 'You’ll check the shop and approve on the next screen'
                : 'Shops are paid in naira'}
            </AppText>
          </>
        ) : (
          <>
            <Button
              label="Hum it"
              icon={<HumMark size={20} color={palette.nearBlack} />}
              disabled={amount <= 0 || exceedsBalance}
              onPress={() => {
                // Unlock audio inside the tap; browsers block sound started later.
                audioEngine.prepare();
                router.push('/hum/humming');
              }}
            />
            <AppText variant="label" color="textMuted" align="center">
              Then hold phones close, about a foot apart
            </AppText>
          </>
        )
      }
    >
      <Header
        center={<Wordmark size={26} />}
        right={
          DOLLARS_ENABLED ? <CurrencyToggle value={currency} onChange={setCurrency} /> : undefined
        }
      />

      {online && Platform.OS === 'web' && !listenOnWeb ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // Unlock audio inside the tap, then listen for the shop's till.
            audioEngine.prepare();
            setListenOnWeb(true);
          }}
          style={[styles.shop, styles.findShop, { borderColor: colors.border }]}
        >
          <Store size={20} color={colors.accentText} strokeWidth={1.75} />
          <View style={styles.shopText}>
            <AppText variant="bodyStrong">Paying a shop?</AppText>
            <AppText variant="label" color="textMuted">
              Tap, then hold your phone near the shop’s till
            </AppText>
          </View>
        </Pressable>
      ) : null}
      {findingShops && Platform.OS === 'web' && shops.length === 0 ? (
        <View style={[styles.shop, styles.findShop, { borderColor: colors.border }]}>
          <Store size={20} color={colors.accentText} strokeWidth={1.75} />
          <View style={styles.shopText}>
            <AppText variant="bodyStrong">Listening for shops…</AppText>
            <AppText variant="label" color="textMuted">
              Hold your phone near the shop’s till. It hums; you don’t need to.
            </AppText>
          </View>
        </View>
      ) : null}
      {shop === null ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: '/scan',
              params: { ...(amount > 0 ? { amount: amountInput } : {}), ...(note ? { note } : {}) },
            })
          }
          style={styles.scanLink}
        >
          <ScanLine size={16} color={colors.accentText} strokeWidth={1.75} />
          <AppText variant="label" color="accentText">
            Scan a shop sticker instead
          </AppText>
        </Pressable>
      ) : null}
      {shops.length > 0 ? (
        <View style={styles.shops}>
          <AppText variant="label" color="textMuted">
            {shops.length === 1 ? 'Shop nearby' : 'Shops nearby'}
          </AppText>
          {shops.slice(0, 3).map((nearby) => {
            const selected = shop?.code === nearby.code;
            return (
              <Pressable
                key={nearby.code}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Pay ${nearby.businessName}, verified shop`}
                onPress={() => setChosen(selected ? null : nearby)}
                style={[
                  styles.shop,
                  {
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.surface : 'transparent',
                  },
                ]}
              >
                <ShieldCheck size={20} color={colors.accentText} strokeWidth={1.75} />
                <View style={styles.shopText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {nearby.businessName}
                  </AppText>
                  <AppText variant="label" color="textMuted" numberOfLines={1}>
                    Verified shop · {nearby.location}
                  </AppText>
                </View>
                <AppText variant="label" color="accentText">
                  {selected ? 'Paying' : 'Pay'}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.brand }]}>
        <Rings
          radii={[40, 70, 100, 130]}
          color={colors.brandLine}
          center={{ x: 320, y: 40 }}
          opacity={0.7}
        />
        <AppText variant="overline" color="onBrandMuted">
          {shop ? `PAYING ${shop.businessName.toUpperCase()}` : 'PAYING SOMEONE NEARBY'}
        </AppText>
        <AppText
          accessibilityLabel={`Amount ${formatMoney(amount, currency)}`}
          style={[styles.amount, { fontSize, lineHeight: fontSize * 1.12, color: colors.onBrand }]}
          numberOfLines={1}
        >
          <AppText
            style={[
              styles.amount,
              { fontSize, lineHeight: fontSize * 1.12, color: palette.softTeal },
            ]}
          >
            {CURRENCY_SYMBOL[currency]}
          </AppText>
          {display}
        </AppText>
        <AppText variant="body" color="onBrand" style={styles.balance}>
          Balance {naira === null ? '…' : formatMoney(naira, 'NGN', { decimals: 2 })}
          {DOLLARS_ENABLED ? (
            <>
              {' · '}
              <AppText variant="body" color="goldOnBrand">
                {usdc === null ? '…' : `${formatMoney(usdc, 'USDC', { decimals: 2 })} USDC`}
              </AppText>
            </>
          ) : null}
        </AppText>
        {exceedsBalance ? (
          <AppText variant="label" color="goldOnBrand">
            {"That's more than your "}
            {currency === 'NGN' ? 'naira' : 'USDC'} balance.
          </AppText>
        ) : null}
        <View style={styles.note}>
          <TextField
            label="What's it for?"
            value={note}
            onChangeText={setNote}
            placeholder="Suya & drinks"
            maxLength={60}
            returnKeyType="done"
            onBrand
          />
        </View>
        <AdireBand color={colors.brandLine} style={styles.band} />
      </View>

      <View style={styles.keypad}>
        <Keypad
          allowDecimal={currency === 'USDC'}
          onKeyPress={(key) => setAmountInput(applyKeypadInput(amountInput, key))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 14,
    marginTop: 16,
    gap: 4,
  },
  amount: { fontFamily: fonts.display, letterSpacing: -2.4, marginTop: 6 },
  balance: { opacity: 0.92 },
  note: { marginTop: 18 },
  band: { marginTop: 22 },
  keypad: { flex: 1, justifyContent: 'center', paddingVertical: 20 },
  shops: { gap: 8, marginTop: 12 },
  shop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1.5,
  },
  shopText: { flex: 1, gap: 2 },
  findShop: { marginTop: 12 },
  scanLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
});
