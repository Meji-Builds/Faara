import { Check, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { Claimant } from '@/data/fixtures';
import { initials } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

/** "20cm" under a metre, "1.1m" beyond. */
export function formatDistance(cm: number): { value: string; unit: string } {
  return cm < 100
    ? { value: String(Math.round(cm)), unit: 'cm' }
    : { value: (cm / 100).toFixed(1), unit: 'm' };
}

interface ClaimantCardProps {
  claimant: Claimant;
  selected: boolean;
  closest: boolean;
  onSelect: () => void;
}

export function ClaimantCard({ claimant, selected, closest, onSelect }: ClaimantCardProps) {
  const { colors } = useTheme();
  const distance = formatDistance(claimant.distanceCm);
  const { risk } = claimant;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${claimant.name}, @${claimant.username}, ${distance.value} ${distance.unit === 'cm' ? 'centimetres' : 'metres'} away. ${
        risk.level === 'low' ? 'Wallet checked, low risk.' : `Warning: ${risk.reason}.`
      }`}
      onPress={onSelect}
      style={[
        styles.card,
        selected
          ? { backgroundColor: colors.brand, borderColor: colors.accent, borderWidth: 2.5 }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.top}>
        <Avatar size={52} tone={claimant.tone} initials={initials(claimant.name)} />
        <View style={styles.identity}>
          <AppText variant="subheading" color={selected ? 'onBrand' : 'text'} numberOfLines={1}>
            {claimant.name}
          </AppText>
          <AppText variant="body" color={selected ? 'onBrandMuted' : 'textMuted'} numberOfLines={1}>
            @{claimant.username}
          </AppText>
        </View>
        <View style={styles.distance}>
          <AppText
            style={[styles.distanceValue, { color: selected ? colors.onBrand : colors.textMuted }]}
          >
            {distance.value}
            <AppText
              style={[styles.distanceUnit, { color: selected ? colors.onBrand : colors.textMuted }]}
            >
              {distance.unit}
            </AppText>
          </AppText>
          {closest ? (
            <AppText
              variant="label"
              style={[
                styles.closest,
                { color: selected ? palette.electricTeal : colors.accentText },
              ]}
            >
              Closest
            </AppText>
          ) : null}
        </View>
        <View
          style={[
            styles.radio,
            selected
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : { borderColor: colors.brandLine },
          ]}
        >
          {selected ? <Check size={16} color={palette.nearBlack} strokeWidth={3} /> : null}
        </View>
      </View>

      {risk.level === 'low' ? (
        <View
          style={[
            styles.chip,
            { backgroundColor: selected ? colors.brandInset : colors.surfaceMuted },
          ]}
        >
          <ShieldCheck
            size={18}
            color={selected ? palette.electricTeal : colors.accentText}
            strokeWidth={1.75}
          />
          <AppText variant="label" color={selected ? 'onBrand' : 'text'} style={styles.chipText}>
            Wallet checked ·{' '}
            <AppText
              variant="label"
              style={{ color: selected ? palette.electricTeal : colors.accentText }}
            >
              Low risk
            </AppText>
          </AppText>
          <AppText
            variant="caption"
            color={selected ? 'onBrandMuted' : 'textMuted'}
            style={styles.history}
          >
            {risk.history}
          </AppText>
        </View>
      ) : (
        <View style={[styles.chip, { backgroundColor: colors.warningSurface }]}>
          <TriangleAlert size={18} color={colors.gold} strokeWidth={1.75} />
          <AppText variant="label" style={[styles.chipText, { color: colors.gold }]}>
            {risk.reason}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, padding: 16, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identity: { flex: 1, gap: 2 },
  distance: { alignItems: 'flex-end' },
  distanceValue: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.5 },
  distanceUnit: { fontFamily: fonts.displayBold, fontSize: 13 },
  closest: { fontFamily: fonts.bodySemiBold },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipText: { flexShrink: 1, fontSize: 14 },
  history: { flex: 1, minWidth: 56, textAlign: 'right' },
});
