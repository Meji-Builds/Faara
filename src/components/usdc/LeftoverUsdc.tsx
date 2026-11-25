import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { randomId } from '@/features/offline';
import { withdrawalState, withdrawUsdc } from '@/features/solanaMobile';
import { getLeftoverUsdc } from '@/features/usdc/usdcApi';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

const POLL_MS = 2_000;
const POLL_LIMIT = 30;

/**
 * Faara used to keep converted USDC in a wallet it held for each person. That's gone: all
 * USDC lives in the person's own dollar wallet. This offers to move anything left over.
 */
export function LeftoverUsdc({ to, onMoved }: { to: string; onMoved: () => void }) {
  const [cents, setCents] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getLeftoverUsdc()
      .then(({ cents: left }) => setCents(left))
      .catch(() => undefined);
  }, []);

  if (cents <= 0 && !message) return null;

  const move = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const requestId = randomId('WD');
      await withdrawUsdc(to, cents, requestId);
      let state: 'pending' | 'done' | 'failed' = 'pending';
      for (let i = 0; state === 'pending' && i < POLL_LIMIT; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        state = (await withdrawalState(requestId)).state;
      }
      if (state === 'failed') throw new Error('The move didn’t go through. Nothing was taken.');
      haptics.success();
      setMessage(
        state === 'done'
          ? `${(cents / 100).toFixed(2)} USDC is now in your dollar wallet.`
          : 'Moving now. It’s still confirming on the network.',
      );
      setCents(0);
      onMoved();
    } catch (cause) {
      setMessage(friendlyError(cause, 'Couldn’t move it. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padded style={styles.card}>
      {cents > 0 ? (
        <>
          <AppText variant="bodyStrong">
            {(cents / 100).toFixed(2)} USDC is still in your old Faara-held wallet
          </AppText>
          <AppText color="textMuted">
            All your USDC now lives in this dollar wallet. Move it over in one tap.
          </AppText>
          <Button label="Move it here" loading={busy} onPress={move} />
        </>
      ) : null}
      {message ? (
        <AppText variant="label" color="accentText">
          {message}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, marginTop: 16 },
});
