import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, OtpField } from '@/components/ui';
import { DOLLARS_ENABLED } from '@/config/features';
import { PIN_LENGTH } from '@/features/wallet';
import { friendlyError } from '@/lib/errors';

interface PinSetupProps {
  /** Called with the confirmed PIN. Rejections are shown as errors. */
  onComplete: (pin: string) => Promise<void>;
  busyLabel: string;
  title?: string;
}

/** Two-step PIN creation: enter, then confirm. */
export function PinSetup({ onComplete, busyLabel, title = 'Create your PIN' }: PinSetupProps) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirming = first !== null;
  const complete = pin.length === PIN_LENGTH;

  const next = async () => {
    setError(null);
    if (!confirming) {
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
        setError('That PIN is too easy to guess. Choose another.');
        setPin('');
        return;
      }
      setFirst(pin);
      setPin('');
      return;
    }
    if (pin !== first) {
      setError('PINs don’t match. Start again.');
      setFirst(null);
      setPin('');
      return;
    }
    setBusy(true);
    try {
      await onComplete(pin);
    } catch (cause) {
      setError(friendlyError(cause, 'Something went wrong. Try again.'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          {confirming ? 'Confirm your PIN' : title}
        </AppText>
        <AppText color="textMuted">
          {confirming
            ? 'Enter the same six digits again.'
            : DOLLARS_ENABLED
              ? 'You’ll use this six-digit PIN to approve payments and to see your recovery phrase.'
              : 'You’ll use this six-digit PIN to approve payments on this phone.'}
        </AppText>
      </View>
      <OtpField
        key={confirming ? 'confirm' : 'create'}
        value={pin}
        onChangeText={setPin}
        length={PIN_LENGTH}
        secure
        autoFocus
        accessibilityLabel={confirming ? 'Confirm PIN' : 'New PIN'}
      />
      {error ? (
        <AppText variant="label" color="gold">
          {error}
        </AppText>
      ) : null}
      <Button
        label={busy ? busyLabel : confirming ? 'Confirm PIN' : 'Continue'}
        disabled={!complete}
        loading={busy}
        onPress={next}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20 },
  intro: { gap: 6, marginTop: 24 },
  button: { marginTop: 8 },
});
