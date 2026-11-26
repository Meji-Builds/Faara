import { useRouter } from 'expo-router';
import { QrCode, WifiOff } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Approve } from '@/components/security/Approve';
import { AppText, Button, Card, Header, ListRow, Screen, TextTabs } from '@/components/ui';
import { useAuth } from '@/features/auth';
import {
  keyFromAddress,
  maxPayment,
  movePocket,
  releasePocket,
  restorePocket,
  saveReserve,
  spendable,
  syncOffline,
  updateLedger,
  useLedger,
  type ReceivedPayment,
  type SentPayment,
} from '@/features/offline';
import { usePreferences } from '@/features/preferences';
import { useWallet } from '@/features/wallet';
import { useOnline } from '@/lib/connectivity';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** What someone can choose to keep ready, in kobo. */
const RESERVES = ['0', '500000', '1000000', '2000000'] as const;
type Reserve = (typeof RESERVES)[number];
const RESERVE_LABELS: Record<Reserve, string> = {
  '0': 'Off',
  '500000': '₦5,000',
  '1000000': '₦10,000',
  '2000000': '₦20,000',
};

const RECEIVED_LABEL: Record<ReceivedPayment['status'], string> = {
  waiting: 'Settles when online',
  settled: 'In your balance',
  'already-settled': 'In your balance',
  rejected: 'Couldn’t settle',
};

function sentLabel(s: SentPayment): string {
  if (s.delivery === 'refused') return 'Not accepted';
  if (s.delivery === 'confirmed') {
    return s.status === 'settled' || s.status === 'already-settled'
      ? 'Paid'
      : 'Settles when online';
  }
  return day(s.note.note.createdAt);
}

/**
 * Offline payments: how much to keep ready, what's in the pocket, and history. Paying and
 * receiving happen through the normal hum; QR codes are the backup for phones without it.
 */
export default function OfflineScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const ledger = useLedger(uid);
  const online = useOnline();
  const { preferences, setPreference } = usePreferences();
  const walletAddress = useWallet().deviceAddress;
  const [choosing, setChoosing] = useState<Reserve | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const { pocket, remote } = ledger;
  const left = spendable(pocket, now);
  const canRelease = remote !== null && now >= remote.releasableAt;
  const reserve = String(Math.max(0, preferences.offlineReserveKobo)) as Reserve;
  const bluetoothHum = Platform.OS === 'android';

  const keepReady = async (kobo: number) => {
    setPreference('offlineReserveKobo', kobo);
    // Kept on the account too, so a reinstall or a new phone keeps the choice.
    void saveReserve(kobo).catch(() => undefined);
    await syncOffline(uid, { reserveKobo: kobo, walletAddress });
  };

  // The pocket is set aside with a key this phone doesn't hold: from before a reinstall that
  // made a new wallet, or on another phone. It can be moved here.
  const myKey = walletAddress ? keyFromAddress(walletAddress) : null;
  const elsewhere = !pocket && remote !== null && !canRelease;
  const canMove = elsewhere && myKey !== null && remote?.devicePublicKey !== myKey;
  const [moving, setMoving] = useState(false);

  const moveHere = async () => {
    if (!myKey) return;
    const back = await movePocket(myKey);
    await updateLedger(uid, (l) => {
      const next = restorePocket(l, back.certificate, back.remainingKobo, Date.now());
      return { ledger: next, result: null };
    });
    await syncOffline(uid, { walletAddress });
  };

  const release = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { releasedKobo } = await releasePocket();
      await syncOffline(uid);
      haptics.success();
      setMessage(`${naira(releasedKobo)} is back in your balance.`);
    } catch (cause) {
      setMessage(friendlyError(cause, 'Couldn’t release the pocket. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (moving && remote) {
    return (
      <Screen
        footer={
          <Approve
            reason={`Use your ${naira(remote.remainingKobo)} offline pocket on this phone.`}
            onApproved={async () => {
              await moveHere();
              haptics.success();
              setMoving(false);
              setMessage('Your offline pocket is on this phone now.');
            }}
          />
        }
      >
        <Header
          onBack={() => setMoving(false)}
          center={<AppText variant="subheading">Use it on this phone</AppText>}
        />
        <View style={styles.body}>
          <AppText color="textMuted">
            Your pocket was set aside with a key this phone doesn’t have, usually because the app
            was reinstalled with a new wallet, or you changed phones.
          </AppText>
          <AppText color="textMuted">
            Moving it lets you pay from the {naira(remote.remainingKobo)} left here. Payments
            already made from it still go through. If you still use another phone, it can no longer
            pay offline from this pocket.
          </AppText>
        </View>
      </Screen>
    );
  }

  // Setting money aside needs the person's approval once; turning it off doesn't.
  if (choosing && choosing !== '0') {
    const kobo = Number(choosing);
    return (
      <Screen
        footer={
          <Approve
            reason={`Keep ${naira(kobo)} ready for offline payments.`}
            onApproved={async () => {
              await keepReady(kobo);
              haptics.success();
              setChoosing(null);
            }}
          />
        }
      >
        <Header
          onBack={() => setChoosing(null)}
          center={<AppText variant="subheading">Keep {naira(kobo)} ready</AppText>}
        />
        <View style={styles.body}>
          <AppText color="textMuted">
            Faara moves up to {naira(kobo)} from your balance into a pocket on this phone, and tops
            it back up whenever you’re online. With no network, a normal hum pays from it.
          </AppText>
          <AppText color="textMuted">
            It’s still your money. Turn this off and whatever is left comes back to your balance
            once the pocket ends, up to 9 days later.
          </AppText>
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
              READY OFFLINE
            </AppText>
          </View>
          {pocket ? (
            <>
              <AppText variant="title" color="onBrand">
                {naira(left)}
              </AppText>
              <AppText color="onBrandMuted">
                Up to {naira(maxPayment(pocket, now))} per payment. With no network, just hum as
                usual.
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
                  : canMove
                    ? `Set aside with a key this phone doesn’t have (a reinstall or another phone). Move it here, or it returns to your balance on ${day(remote.releasableAt)}.`
                    : walletAddress
                      ? 'Getting your pocket back on this phone…'
                      : `Set up your wallet to use it here. Otherwise it returns on ${day(remote.releasableAt)}.`}
              </AppText>
            </>
          ) : (
            <AppText color="onBrand">
              Choose an amount to keep ready. Then when there’s no network, you pay with a normal
              hum and it settles once either phone is back online.
            </AppText>
          )}
        </Card>

        <View style={styles.choose}>
          <AppText variant="subheading">Keep ready on this phone</AppText>
          <TextTabs
            options={RESERVES}
            labels={RESERVE_LABELS}
            value={RESERVES.includes(reserve) ? reserve : '0'}
            onChange={(value) => {
              setMessage(null);
              if (value === '0') {
                void keepReady(0).catch(() => undefined);
              } else if (!online) {
                setMessage('Go online to set money aside.');
              } else {
                setChoosing(value);
              }
            }}
          />
          {!bluetoothHum ? (
            <AppText variant="label" color="textMuted">
              Paying by hum with no network needs the Faara app on Android. On this device, use a QR
              code below.
            </AppText>
          ) : null}
        </View>

        {message ? (
          <AppText variant="label" color="gold" align="center">
            {message}
          </AppText>
        ) : null}

        {canMove ? (
          <Button
            label="Use it on this phone"
            disabled={!online}
            onPress={() => {
              setMessage(null);
              setMoving(true);
            }}
          />
        ) : null}

        {canRelease ? (
          <Button label="Return to balance" loading={busy} disabled={!online} onPress={release} />
        ) : null}

        <View style={styles.qr}>
          <AppText variant="overline" color="textMuted">
            NO BLUETOOTH? USE A QR CODE
          </AppText>
          <ListRow
            label="Pay with a QR code"
            icon={<QrCode size={20} color={colors.text} strokeWidth={1.75} />}
            onPress={left > 0 ? () => router.push('/offline/pay') : undefined}
            value={left > 0 ? undefined : 'Nothing ready'}
          />
          <ListRow
            label="Receive with a QR code"
            icon={<QrCode size={20} color={colors.text} strokeWidth={1.75} />}
            onPress={() => router.push('/offline/receive')}
          />
        </View>

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
                value={sentLabel(s)}
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
  choose: { gap: 10 },
  qr: { gap: 4 },
  section: { marginBottom: 4 },
});
