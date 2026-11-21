import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ApplicationForReview } from '@shared/vendors';

import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { listApplications, reviewApplication } from '@/features/vendors';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** For Faara's team: vendor applications waiting for a decision. */
export default function VendorReviewScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<ApplicationForReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await listApplications()).applications);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t load applications. Try again.'));
    }
  }, []);

  useEffect(() => {
    // Load the waiting applications once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Review vendors</AppText>} />
      <View style={styles.body}>
        {error ? <AppText color="gold">{error}</AppText> : null}
        {items === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {items?.length === 0 ? <AppText color="textMuted">No applications waiting.</AppText> : null}
        {items?.map((item) => (
          <ApplicationCard key={item.uid} item={item} onDecided={load} />
        ))}
      </View>
    </Screen>
  );
}

function ApplicationCard({
  item,
  onDecided,
}: {
  item: ApplicationForReview;
  onDecided: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await reviewApplication(item.uid, approve, reason.trim());
      haptics.success();
      await onDecided();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t save that decision. Try again.'));
      setBusy(false);
    }
  };

  return (
    <Card padded style={styles.card}>
      <AppText variant="subheading">{item.businessName}</AppText>
      <AppText color="textMuted">
        {item.category} · {item.location}
      </AppText>
      <AppText>{item.description}</AppText>
      <AppText variant="label" color="textMuted">
        {item.applicant.fullName} (@{item.applicant.username}) · {item.applicant.phone}
      </AppText>
      <AppText variant="label" color="textMuted">
        NIN ending {item.ninLast4}
        {item.cacNumber ? ` · CAC ${item.cacNumber}` : ' · Not registered with CAC'} · Applied{' '}
        {when(item.submittedAt)}
      </AppText>
      {error ? (
        <AppText variant="label" color="gold">
          {error}
        </AppText>
      ) : null}
      {rejecting ? (
        <>
          <TextField
            label="Why (the applicant sees this)"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Please give a clearer business location."
          />
          <Button
            label="Reject application"
            variant="outline"
            disabled={reason.trim().length < 5}
            loading={busy}
            onPress={() => decide(false)}
          />
          <Button label="Back" variant="text" onPress={() => setRejecting(false)} />
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            label="Reject"
            variant="outline"
            onPress={() => setRejecting(true)}
            style={styles.flex}
          />
          <Button label="Approve" loading={busy} onPress={() => decide(true)} style={styles.flex} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  card: { gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
});
