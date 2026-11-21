import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Copy, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { REQUEST_LIMITS, type PaymentRequest } from '@shared/requests';

import { SuccessBurst } from '@/components/brand';
import { AppText, Button, Header, Screen, TextField } from '@/components/ui';
import { createRequest, naira } from '@/features/requests';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { requestLink } from '@/lib/links';
import { groupDigits } from '@/lib/money';
import { palette, radii, useTheme } from '@/theme';

/** Create a payment request (invoice) for one person or anyone with the link. */
export default function NewRequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [copied, setCopied] = useState(false);

  const amountKobo = Number(amountText.replace(/,/g, '') || '0') * 100;
  const valid =
    amountKobo >= REQUEST_LIMITS.minKobo &&
    amountKobo <= REQUEST_LIMITS.maxKobo &&
    note.trim().length > 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const request = await createRequest(amountKobo, note.trim(), from.trim() || null);
      haptics.success();
      setCreated(request);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t create the invoice. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const link = requestLink(created.id);
    const message = `${created.requester.fullName} is asking for ${naira(created.amountKobo)} for "${created.note}". Pay on Faara: ${link}`;
    return (
      <Screen
        footer={
          <>
            <Button
              label="Share link"
              icon={<Share2 size={18} color={palette.nearBlack} strokeWidth={1.75} />}
              onPress={() => Share.share({ message }).catch(() => undefined)}
            />
            <Button
              label={copied ? 'Copied' : 'Copy link'}
              variant="outline"
              icon={<Copy size={18} color={colors.text} strokeWidth={1.75} />}
              onPress={async () => {
                await Clipboard.setStringAsync(link);
                setCopied(true);
              }}
            />
            <Button label="Done" variant="text" onPress={() => router.back()} />
          </>
        }
      >
        <View style={styles.done}>
          <SuccessBurst size={72} />
          <AppText variant="title" align="center">
            {naira(created.amountKobo)} invoice ready
          </AppText>
          <AppText color="textMuted" align="center">
            {created.from
              ? `${created.from.fullName} has been told. They can also scan this or open the link.`
              : 'Anyone with this link or code can pay it. You’ll see the moment it’s paid.'}
          </AppText>
          <View style={styles.qr}>
            <QRCode value={link} size={220} color={palette.deepGreen} backgroundColor="#FFFFFF" />
          </View>
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
            label={valid ? `Request ${naira(amountKobo)}` : 'Create invoice'}
            disabled={!valid}
            loading={busy}
            onPress={create}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">New invoice</AppText>} />
      <View style={styles.form}>
        <TextField
          label="Amount in naira"
          value={amountText}
          onChangeText={(text) =>
            setAmountText(groupDigits(text.replace(/[^0-9]/g, '').slice(0, 7)))
          }
          placeholder="5,000"
          keyboardType="number-pad"
          autoFocus
        />
        <TextField
          label="What it’s for"
          value={note}
          onChangeText={(text) => setNote(text.slice(0, REQUEST_LIMITS.maxNote))}
          placeholder="Garri, rent, dues…"
        />
        <TextField
          label="Who should pay (optional)"
          value={from}
          onChangeText={(text) => setFrom(text.toLowerCase())}
          placeholder="Username, or leave empty for anyone"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, marginTop: 20 },
  done: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  qr: { marginTop: 8, padding: 16, borderRadius: radii.xl, backgroundColor: '#FFFFFF' },
});
