import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReceiptText } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import type { Dispute } from '@shared/disputes';
import type { ActivityEntry } from '@shared/hum';

import { ReceiptActions, ReceiptView } from '@/components/payments';
import { AppText, Button, EmptyState, Header, Screen } from '@/components/ui';
import { watchActivityEntry } from '@/features/account';
import { useAuth } from '@/features/auth';
import { getDispute } from '@/features/disputes';
import { receiptFromActivity } from '@/features/receipts';
import type { ViewRef } from '@/lib/viewRef';
import { useTheme } from '@/theme';

/** Receipt for one settled payment, shareable as an image or PDF. */
export default function ReceiptScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const [entry, setEntry] = useState<ActivityEntry | null | undefined>(undefined);
  const captureRef: ViewRef = useRef(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);

  // A payment someone disputed shows that on the receipt, for both people.
  useEffect(() => {
    if (!paymentId) return;
    let active = true;
    getDispute(paymentId)
      .then((result) => active && setDispute(result.dispute))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [paymentId]);

  useEffect(() => {
    if (!user || !paymentId) return;
    return watchActivityEntry(user.uid, paymentId, setEntry);
  }, [user, paymentId]);

  const header = <Header center={<AppText variant="subheading">Receipt</AppText>} />;

  if (entry === undefined) {
    return (
      <Screen>
        {header}
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      </Screen>
    );
  }
  if (entry === null) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<ReceiptText size={30} color={colors.accentText} strokeWidth={1.75} />}
          title="Receipt not found"
          message="This payment isn’t in your activity."
        />
      </Screen>
    );
  }

  const receipt = receiptFromActivity(entry);
  return (
    <Screen footer={<ReceiptActions receipt={receipt} captureRef={captureRef} />}>
      {header}
      <ReceiptView receipt={receipt} captureRef={captureRef} />
      {dispute ? (
        <Button
          label={
            dispute.status === 'open'
              ? 'This payment is being looked into'
              : dispute.status === 'refunded'
                ? 'This payment was refunded'
                : 'This payment’s dispute was closed'
          }
          variant="outline"
          onPress={() => router.push({ pathname: '/dispute/[paymentId]', params: { paymentId } })}
        />
      ) : null}
      {/* Payments you made can be disputed; for anything else, ask support. */}
      {dispute ? null : (
        <Button
          label={
            entry.direction === 'out' && entry.kind !== 'deposit' && entry.kind !== 'refund'
              ? 'Report a problem with this payment'
              : 'Get help with this payment'
          }
          variant="text"
          onPress={() =>
            entry.direction === 'out' && entry.kind !== 'deposit' && entry.kind !== 'refund'
              ? router.push({ pathname: '/dispute/[paymentId]', params: { paymentId } })
              : router.push({ pathname: '/support/new', params: { paymentId } })
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
});
