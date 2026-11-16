import { useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClaimantCard } from '@/components/hum';
import { AppText, Button, Header, Screen } from '@/components/ui';
import { outOfRangeClaims, sampleClaimants } from '@/data/fixtures';
import { useHumDraft } from '@/features/hum';
import { useTheme } from '@/theme';

export default function PickRecipientScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { amountLabel, note, recipientId, setRecipientId } = useHumDraft();
  const claimants = sampleClaimants;
  const onlyClaimant = claimants.length === 1 ? claimants[0] : undefined;

  // Preselect only when there is exactly one claimant; otherwise the sender must choose.
  useEffect(() => {
    if (onlyClaimant && recipientId === null) setRecipientId(onlyClaimant.id);
  }, [onlyClaimant, recipientId, setRecipientId]);

  const selected = claimants.find((claimant) => claimant.id === recipientId);
  const count =
    claimants.length === 1
      ? 'One phone'
      : claimants.length === 2
        ? 'Two phones'
        : `${claimants.length} phones`;

  return (
    <Screen
      footer={
        <Button
          label={selected ? `Pay ${selected.firstName} ${amountLabel}` : 'Choose who gets paid'}
          disabled={!selected}
          onPress={() => router.push('/hum/confirm')}
        />
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
          {count} caught your hum. Nobody is paid until you choose. Closest is on top.
        </AppText>
      </View>

      <View style={styles.list} accessibilityRole="radiogroup">
        {claimants.map((claimant, index) => (
          <ClaimantCard
            key={claimant.id}
            claimant={claimant}
            closest={index === 0}
            selected={claimant.id === recipientId}
            onSelect={() => setRecipientId(claimant.id)}
          />
        ))}
      </View>

      {outOfRangeClaims > 0 ? (
        <View style={styles.footnote}>
          <Info size={20} color={colors.textMuted} strokeWidth={1.75} />
          <AppText variant="body" color="textMuted">
            {outOfRangeClaims === 1
              ? '1 more phone heard it but was too far to claim'
              : `${outOfRangeClaims} more phones heard it but were too far to claim`}
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8, marginTop: 24 },
  list: { gap: 14, marginTop: 24 },
  footnote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginLeft: 4,
    marginBottom: 16,
  },
});
