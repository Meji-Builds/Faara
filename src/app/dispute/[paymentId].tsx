import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  DISPUTE_REASON_LABELS,
  DISPUTE_REASONS,
  SECOND_APPROVAL_KOBO,
  type Dispute,
  type DisputeReason,
} from '@shared/disputes';
import type { ActivityEntry } from '@shared/hum';

import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { watchActivityEntry } from '@/features/account';
import { useIsAdmin } from '@/features/admin';
import { useAuth } from '@/features/auth';
import { decideDispute, getDispute, openDispute } from '@/features/disputes';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { radii, useTheme } from '@/theme';

const amountOf = (minor: number, currency: 'NGN' | 'USDC') =>
  currency === 'USDC'
    ? `${formatMoney(minor / 100, 'USDC', { decimals: 2 })} USDC`
    : formatMoney(minor / 100, 'NGN');

const STATUS_LABEL: Record<Dispute['status'], string> = {
  open: 'Being looked into',
  refunded: 'Refunded',
  rejected: 'Closed without a refund',
};

/**
 * A dispute about one payment. The payer reports what went wrong; while it's open the naira
 * is held in the recipient's account. Both people can see where it stands, and Faara's team
 * decides it here: refund the payer or release the hold.
 */
export default function DisputeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const [dispute, setDispute] = useState<Dispute | null | undefined>(undefined);
  const [entry, setEntry] = useState<ActivityEntry | null | undefined>(undefined);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [details, setDetails] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!paymentId) return;
    getDispute(paymentId)
      .then(({ dispute: found }) => setDispute(found))
      .catch((cause: unknown) => {
        setDispute(null);
        setError(friendlyError(cause, 'Couldn’t load this dispute. Try again.'));
      });
  }, [paymentId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!user || !paymentId) return;
    return watchActivityEntry(user.uid, paymentId, setEntry);
  }, [user, paymentId]);

  const header = <Header center={<AppText variant="subheading">Payment problem</AppText>} />;

  if (dispute === undefined || (dispute === null && entry === undefined)) {
    return (
      <Screen>
        {header}
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      </Screen>
    );
  }

  // No dispute yet: the payer can open one.
  if (dispute === null) {
    const canDispute =
      entry && entry.direction === 'out' && entry.kind !== 'deposit' && entry.kind !== 'refund';
    if (!entry || !canDispute) {
      return (
        <Screen>
          {header}
          <AppText color="textMuted" style={styles.loading}>
            {error ?? 'Only the person who made a payment can raise a problem with it.'}
          </AppText>
        </Screen>
      );
    }
    const submit = async () => {
      if (!reason) return;
      setBusy(true);
      setError(null);
      try {
        setDispute(await openDispute(entry.paymentId, reason, details.trim()));
        haptics.success();
      } catch (cause) {
        setError(friendlyError(cause, 'Couldn’t raise it. Try again.'));
      } finally {
        setBusy(false);
      }
    };
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
              label="Raise the problem"
              loading={busy}
              disabled={!reason || details.trim().length < 10}
              onPress={submit}
            />
          </>
        }
      >
        {header}
        <View style={styles.body}>
          <Card padded style={styles.card}>
            <AppText variant="label" color="textMuted">
              Payment
            </AppText>
            <AppText variant="subheading">
              {amountOf(entry.amountMinor, entry.currency)} to {entry.counterpartyName}
            </AppText>
          </Card>
          {entry.currency === 'USDC' ? (
            <AppText variant="label" color="gold">
              Dollar payments live in people’s own wallets, so Faara can’t reverse them. We’ll still
              look into it and can ask the recipient to send it back.
            </AppText>
          ) : (
            <AppText variant="label" color="textMuted">
              While Faara looks into it, the amount is held in the recipient’s account so it can’t
              be spent.
            </AppText>
          )}
          <AppText variant="subheading">What went wrong?</AppText>
          <View style={styles.reasons}>
            {DISPUTE_REASONS.map((option) => {
              const selected = option === reason;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setReason(option)}
                  style={[styles.reason, { borderColor: selected ? colors.accent : colors.border }]}
                >
                  <AppText style={styles.flex}>{DISPUTE_REASON_LABELS[option]}</AppText>
                  {selected ? <Check size={18} color={colors.accentText} strokeWidth={2} /> : null}
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Tell us what happened"
            value={details}
            onChangeText={setDetails}
            placeholder="I paid for rice at 2pm but the seller says nothing arrived…"
            multiline
            maxLength={1000}
          />
        </View>
      </Screen>
    );
  }

  // A dispute exists: where it stands, and (for the team) the decision.
  const iAmPayer = user?.uid !== undefined && entry?.direction === 'out';
  const canDecide = isAdmin && dispute.status === 'open' && !iAmPayer && entry?.direction !== 'in';
  const needsTwo = dispute.currency === 'NGN' && dispute.amountMinor >= SECOND_APPROVAL_KOBO;

  const decide = async (action: 'refund' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      setDispute(await decideDispute(dispute.paymentId, action, note.trim()));
      setNote('');
      haptics.success();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t save the decision. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        iAmPayer && dispute.ticketId ? (
          <Button
            label="Talk to Faara about it"
            variant="outline"
            onPress={() =>
              router.push({ pathname: '/support/[id]', params: { id: dispute.ticketId ?? '' } })
            }
          />
        ) : undefined
      }
    >
      {header}
      <View style={styles.body}>
        <Card tone="brand" padded style={styles.card}>
          <AppText variant="overline" color="onBrandMuted">
            {STATUS_LABEL[dispute.status].toUpperCase()}
          </AppText>
          <AppText variant="title" color="onBrand">
            {amountOf(dispute.amountMinor, dispute.currency)}
          </AppText>
          <AppText color="onBrandMuted">
            From {dispute.payer.fullName} to {dispute.payee.fullName}
          </AppText>
          {dispute.status === 'open' && dispute.heldKobo > 0 ? (
            <AppText variant="label" color="onBrand">
              {amountOf(dispute.heldKobo, 'NGN')} is on hold in {dispute.payee.fullName}’s account
              until it’s decided.
            </AppText>
          ) : null}
          {dispute.decision ? (
            <AppText variant="label" color="onBrand">
              {dispute.status === 'refunded'
                ? `${amountOf(dispute.decision.refundedKobo, 'NGN')} went back to ${dispute.payer.fullName}. `
                : ''}
              {dispute.decision.note}
            </AppText>
          ) : null}
        </Card>

        <Card padded style={styles.card}>
          <AppText variant="label" color="textMuted">
            {DISPUTE_REASON_LABELS[dispute.reason]}
          </AppText>
          <AppText>{dispute.details}</AppText>
        </Card>

        {canDecide ? (
          <View style={styles.body}>
            <AppText variant="subheading">Decide</AppText>
            {needsTwo ? (
              <AppText variant="label" color="textMuted">
                Refunds of ₦50,000 or more need two admins.{' '}
                {dispute.approvals.length > 0
                  ? `${dispute.approvals.length} of 2 have approved.`
                  : 'None yet.'}
              </AppText>
            ) : null}
            <TextField
              label="Note (both people see it)"
              value={note}
              onChangeText={setNote}
              placeholder="Why you decided this"
              multiline
              maxLength={500}
            />
            {error ? (
              <AppText variant="label" color="gold">
                {error}
              </AppText>
            ) : null}
            {dispute.currency === 'NGN' ? (
              <Button
                label="Refund the payer"
                loading={busy}
                disabled={note.trim().length < 5}
                onPress={() => void decide('refund')}
              />
            ) : null}
            <Button
              label={
                dispute.currency === 'NGN' ? 'Reject and release the hold' : 'Close the dispute'
              }
              variant="outline"
              disabled={busy || note.trim().length < 5}
              onPress={() => void decide('reject')}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
  body: { gap: 14, marginTop: 16, paddingBottom: 24 },
  card: { gap: 6 },
  reasons: { gap: 8 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1.5,
  },
  flex: { flex: 1 },
});
