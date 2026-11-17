import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClaimantCard, type ClaimantView } from '@/components/hum';
import { Reveal } from '@/components/motion';
import { AppText, Button, Header, Screen } from '@/components/ui';
import { chooseRecipient, useHumDraft } from '@/features/hum';
import { apiErrorMessage } from '@/lib/api/client';
import { haptics } from '@/lib/haptics';

const AVATAR_TONES = ['soft', 'gold', 'surface'] as const;

export default function PickRecipientScreen() {
  const router = useRouter();
  const { amountLabel, note, session, claims, chosen, setChosen } = useHumDraft();
  const [selectedId, setSelectedId] = useState<string | null>(chosen?.claimId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimants: ClaimantView[] = claims.map((claim, index) => ({
    id: claim.id,
    name: claim.fullName,
    username: claim.username,
    distanceCm: claim.distanceCm,
    tone: AVATAR_TONES[index % AVATAR_TONES.length] ?? 'soft',
    safety: claim.safety,
  }));

  // Preselect only when exactly one phone claimed; otherwise the sender must choose.
  const onlyClaimId = claimants.length === 1 ? claimants[0]?.id : undefined;
  const effectiveId = selectedId ?? onlyClaimId ?? null;
  const selected = claimants.find((claimant) => claimant.id === effectiveId);
  const firstName = selected?.name.split(/\s+/)[0] ?? '';
  const count =
    claimants.length === 1
      ? 'One phone'
      : claimants.length === 2
        ? 'Two phones'
        : `${claimants.length} phones`;

  const pay = async () => {
    if (!session || !selected) return;
    // Already chosen this person (e.g. came back from Confirm): continue.
    if (chosen?.claimId === selected.id) {
      router.push('/hum/confirm');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await chooseRecipient(session.paymentId, selected.id);
      setChosen({ claimId: selected.id, shapes: result.shapes, recipient: result.recipient });
      router.push('/hum/confirm');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const locked = chosen !== null;

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
            label={selected ? `Pay ${firstName} ${amountLabel}` : 'Choose who gets paid'}
            disabled={!selected}
            loading={submitting}
            onPress={pay}
          />
        </>
      }
    >
      <Header
        center={
          <AppText variant="subheading" numberOfLines={1}>
            {amountLabel}
            {note ? ` · ${note}` : ''}
          </AppText>
        }
      />

      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Who gets it?
        </AppText>
        <AppText color="textMuted">
          {claimants.length === 0
            ? 'Waiting for a phone to catch your hum.'
            : `${count} caught your hum. Nobody is paid until you choose. Closest is on top.`}
        </AppText>
      </View>

      <View style={styles.list} accessibilityRole="radiogroup">
        {claimants.map((claimant, index) => (
          <Reveal key={claimant.id} delay={index * 90}>
            <ClaimantCard
              claimant={claimant}
              closest={index === 0 && claimant.distanceCm !== null && claimants.length > 1}
              selected={claimant.id === effectiveId}
              onSelect={() => {
                if (locked) return;
                haptics.tap();
                setSelectedId(claimant.id);
              }}
            />
          </Reveal>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8, marginTop: 24 },
  list: { gap: 14, marginTop: 24, paddingBottom: 16 },
});
