import { Modal, StyleSheet, View } from 'react-native';

import { SuccessBurst } from '@/components/brand';
import { AppText, Button, Screen } from '@/components/ui';
import type { OfflineReceiveState } from '@/features/offline';
import { formatMoney } from '@/lib/money';

import { ShapeMatch } from './ShapeMatch';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');

/** What the receiving phone shows during an offline hum: the shapes, then the payment. */
export function OfflineReceiveSheet({
  state,
  onClose,
}: {
  state: OfflineReceiveState;
  onClose: () => void;
}) {
  if (state.kind === 'waiting') return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        footer={state.kind === 'connected' ? undefined : <Button label="Done" onPress={onClose} />}
      >
        <View style={styles.body}>
          {state.kind === 'connected' ? (
            <>
              <AppText variant="title" align="center">
                Someone is paying you
              </AppText>
              <AppText color="textMuted" align="center">
                No network needed. Keep the phones close.
              </AppText>
              <ShapeMatch
                shapes={state.shapes}
                hint="Their screen shows the same three shapes. If it doesn’t, they’re paying someone else."
              />
            </>
          ) : state.kind === 'paid' ? (
            <View style={styles.center}>
              <SuccessBurst size={104} />
              <AppText variant="title" align="center">
                {naira(state.amountKobo)} received
              </AppText>
              <AppText color="textMuted" align="center">
                from {state.fromName}. Checked on this phone with no network. It lands in your
                balance when either phone is back online.
              </AppText>
            </View>
          ) : (
            <View style={styles.center}>
              <AppText variant="title" align="center">
                Payment not accepted
              </AppText>
              <AppText color="gold" align="center">
                {state.reason}
              </AppText>
              <AppText color="textMuted" align="center">
                No money moved. Ask them to try again.
              </AppText>
            </View>
          )}
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 16, paddingVertical: 24 },
  center: { alignItems: 'center', gap: 12 },
});
