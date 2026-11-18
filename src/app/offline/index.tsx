import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, WifiOff } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OFFLINE_LIMITS } from '@shared/offline';

import { Approve } from '@/components/offline';
import { AppText, Button, Card, Header, ListRow, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth';
import {
  devicePublicKey,
  maxPayment,
  openPocket,
  releasePocket,
  spendable,
  syncOffline,
  updateLedger,
  useLedger,
  type ReceivedPayment,
} from '@/features/offline';
import { useOnline } from '@/lib/connectivity';
import { friendlyError } from '@/lib/errors';
import { formatMoney, groupDigits } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const RECEIVED_LABEL: Record<ReceivedPayment['status'], string> = {
  waiting: 'Waits for signal',
  settled: 'In your balance',
  'already-settled': 'In your balance',
  rejected: 'Couldn’t settle',
};

/** The offline pocket: naira set aside to pay and be paid with no network. */
export default function OfflineScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const online = useOnline();
  const [filling, setFilling] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const pocket = ledger.pocket;
  const remote = ledger.remote;
  const left = spendable(pocket, now);
  const amountKobo = Math.round(Number(amountText.replace(/,/g, '') || '0') * 100);
  const validFill = amountKobo >= 100_00 && amountKobo <= OFFLINE_LIMITS.maxPocketKobo;
  const canRelease = remote !== null && now >= remote.releasableAt;

  const release = async () => {
    setBusy(true);
    setError(null);
    try {
      const { releasedKobo } = await releasePocket();
      await syncOffline(uid);
      haptics.success();
      setError(`${naira(releasedKobo)} is back in your balance.`);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t release the pocket. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (filling) {
    return (
      <Screen
        footer={
          validFill ? (
            <Approve
              reason={`Set aside ${naira(amountKobo)} for offline payments.`}
              onApproved={async (secretKey) => {
                const signed = await openPocket(amountKobo, devicePublicKey(secretKey));
                await updateLedger(uid, (current) => ({
                  ledger: {
                    ...current,
                    pocket: { signed, spentKobo: 0, nextSequence: 0, openedAt: Date.now() },
                  },
                  result: null,
                }));
                haptics.success();
                setFilling(false);
                setAmountText('');
                void syncOffline(uid).catch(() => undefined);
              }}
            />
          ) : (
            <Button label="Continue" disabled />
          )
        }
      >
        <Header
          onBack={() => setFilling(false)}
          center={<AppText variant="subheading">Fill your pocket</AppText>}
        />
        <View style={styles.body}>
          <AppText color="textMuted">
            This moves naira from your balance into a pocket on this phone. You can spend it with no
            network for 7 days; whatever’s left comes back after that.
          </AppText>
          <TextField
            label="Amount in naira"
            value={amountText}
            onChangeText={(text) =>
              setAmountText(groupDigits(text.replace(/[^0-9]/g, '').slice(0, 7)))
            }
            placeholder="10,000"
            keyboardType="number-pad"
            autoFocus
            hint={
              <AppText variant="label" color="textMuted">
                Between ₦100 and {naira(OFFLINE_LIMITS.maxPocketKobo)}
              </AppText>
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Offline payments</AppText>} />
      <View style={styles.body}>
        <Card tone="brand" padded style={styles.pocket}>
          <View style={styles.pocketTop}>
            <WifiOff size={18} color={colors.onBrandMuted} strokeWidth={1.75} />
            <AppText variant="overline" color="onBrandMuted">
              OFFLINE POCKET
            </AppText>
          </View>
          {pocket ? (
            <>
              <AppText variant="title" color="onBrand">
                {naira(left)}
              </AppText>
              <AppText color="onBrandMuted">
                Up to {naira(maxPayment(pocket, now))} per payment · until{' '}
                {day(pocket.signed.certificate.expiresAt)}
              </AppText>
            </>
          ) : remote ? (
            <>
              <AppText variant="title" color="onBrand">
                {naira(remote.remainingKobo)}
              </AppText>
              <AppText color="onBrandMuted">
                {canRelease
                  ? 'This pocket has ended. Move what’s left back to your balance.'
                  : `Set aside on another phone. What’s left returns on ${day(remote.releasableAt)}.`}
              </AppText>
            </>
          ) : (
            <AppText color="onBrand">
              Set some naira aside while you’re online. Then you can pay and be paid with no network
              at all, phone to phone.
            </AppText>
          )}
        </Card>

        {error ? (
          <AppText variant="label" color="gold" align="center">
            {error}
          </AppText>
        ) : null}

        {pocket ? (
          <View style={styles.actions}>
            <Button
              label="Pay offline"
              icon={<ArrowUpRight size={18} color={colors.onAccent} strokeWidth={1.75} />}
              disabled={left === 0}
              onPress={() => router.push('/offline/pay')}
            />
            <Button
              label="Receive offline"
              variant="outline"
              icon={<ArrowDownLeft size={18} color={colors.accentText} strokeWidth={1.75} />}
              onPress={() => router.push('/offline/receive')}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            {canRelease ? (
              <Button
                label="Return to balance"
                loading={busy}
                disabled={!online}
                onPress={release}
              />
            ) : !remote ? (
              <Button
                label={online ? 'Fill your pocket' : 'Go online to fill your pocket'}
                disabled={!online}
                onPress={() => setFilling(true)}
              />
            ) : null}
            <Button
              label="Receive offline"
              variant="outline"
              icon={<ArrowDownLeft size={18} color={colors.accentText} strokeWidth={1.75} />}
              onPress={() => router.push('/offline/receive')}
            />
          </View>
        )}

        {ledger.received.length > 0 ? (
          <View>
            <AppText variant="overline" color="textMuted" style={styles.section}>
              RECEIVED
            </AppText>
            {ledger.received.map((r) => (
              <ListRow
                key={r.note.note.noteId}
                label={`${naira(r.note.note.amountKobo)}${r.fromName ? ` from ${r.fromName}` : ''}`}
                value={r.status === 'rejected' && r.reason ? r.reason : RECEIVED_LABEL[r.status]}
                compact
              />
            ))}
          </View>
        ) : null}

        {ledger.sent.length > 0 ? (
          <View>
            <AppText variant="overline" color="textMuted" style={styles.section}>
              PAID
            </AppText>
            {ledger.sent.map((s) => (
              <ListRow
                key={s.note.note.noteId}
                label={`${naira(s.note.note.amountKobo)} to ${s.toName}`}
                value={day(s.note.note.createdAt)}
                compact
              />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 20, paddingBottom: 24 },
  pocket: { gap: 8 },
  pocketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { gap: 10 },
  section: { marginBottom: 4 },
});
