import { useLocalSearchParams } from 'expo-router';
import { ReceiptText } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import type { ActivityEntry } from '@shared/hum';

import { ReceiptActions, ReceiptView } from '@/components/payments';
import { AppText, EmptyState, Header, Screen } from '@/components/ui';
import { watchActivityEntry } from '@/features/account';
import { useAuth } from '@/features/auth';
import { receiptFromActivity } from '@/features/receipts';
import type { ViewRef } from '@/lib/viewRef';
import { useTheme } from '@/theme';

/** Receipt for one settled payment, shareable as an image or PDF. */
export default function ReceiptScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const [entry, setEntry] = useState<ActivityEntry | null | undefined>(undefined);
  const captureRef: ViewRef = useRef(null);

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
});
