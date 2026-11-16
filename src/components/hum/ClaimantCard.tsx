import { Check, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import type { SafetyResult } from '@shared/hum';

import type { AvatarTone } from '@/data/fixtures';
import { initials } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

/** "20cm" under a metre, "1.1m" beyond. */
export function formatDistance(cm: number): { value: string; unit: string } {
  return cm < 100
    ? { value: String(Math.round(cm)), unit: 'cm' }
    : { value: (cm / 100).toFixed(1), unit: 'm' };
}

export interface ClaimantView {
  id: string;
  name: string;
  username: string;
  /** Rough estimate from signal strength; null when unknown (e.g. QR or manual code). */
  distanceCm: number | null;
  tone: AvatarTone;
  /** Safety badge; null until the server's check finishes. */
  safety: SafetyResult | null;
}

interface ClaimantCardProps {
  claimant: ClaimantView;
  selected: boolean;
  closest: boolean;
  onSelect: () => void;
}

function safetyLabel(safety: SafetyResult | null): string {
  if (!safety) return 'Safety check in progress.';
  const prefix = safety.level === 'high' || safety.level === 'caution' ? 'Warning: ' : '';
  return `${prefix}${safety.headline}${safety.detail ? `, ${safety.detail}` : ''}.`;
}

export function ClaimantCard({ claimant, selected, closest, onSelect }: ClaimantCardProps) {
  const { colors } = useTheme();
  const distance = claimant.distanceCm === null ? null : formatDistance(claimant.distanceCm);
  const { safety } = claimant;
  const distanceText = distance
    ? `about ${distance.value} ${distance.unit === 'cm' ? 'centimetres' : 'metres'} away`
    : 'distance unknown';

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${claimant.name}, @${claimant.username}, ${distanceText}. ${safetyLabel(safety)}`}
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
          {distance ? (
            <AppText
              style={[
                styles.distanceValue,
                { color: selected ? colors.onBrand : colors.textMuted },
              ]}
            >
              {distance.value}
              <AppText
                style={[
                  styles.distanceUnit,
                  { color: selected ? colors.onBrand : colors.textMuted },
                ]}
              >
                {distance.unit}
              </AppText>
            </AppText>
          ) : null}
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

      <SafetyChip safety={safety} selected={selected} />
    </Pressable>
  );
}

function SafetyChip({ safety, selected }: { safety: SafetyResult | null; selected: boolean }) {
  const { colors } = useTheme();
  const neutralSurface = selected ? colors.brandInset : colors.surfaceMuted;
  const level = safety?.level ?? 'unchecked';

  if (level === 'caution' || level === 'high') {
    return (
      <View style={[styles.chip, { backgroundColor: colors.warningSurface }]}>
        <TriangleAlert size={18} color={colors.gold} strokeWidth={1.75} />
        <AppText variant="label" style={[styles.chipText, { color: colors.gold }]}>
          {safety?.headline}
        </AppText>
        {safety?.detail ? (
          <AppText variant="caption" style={[styles.history, { color: colors.gold }]}>
            {safety.detail}
          </AppText>
        ) : null}
      </View>
    );
  }

  const good = level === 'low';
  const accent = selected ? palette.electricTeal : colors.accentText;
  const Icon = good ? ShieldCheck : ShieldQuestion;
  const [lead, tail] =
    good && safety?.headline.includes(' · ') ? safety.headline.split(' · ') : [null, null];
  return (
    <View style={[styles.chip, { backgroundColor: neutralSurface }]}>
      <Icon
        size={18}
        color={good ? accent : selected ? colors.onBrandMuted : colors.textMuted}
        strokeWidth={1.75}
      />
      <AppText
        variant="label"
        color={good ? (selected ? 'onBrand' : 'text') : selected ? 'onBrandMuted' : 'textMuted'}
        style={styles.chipText}
      >
        {lead && tail ? (
          <>
            {lead} ·{' '}
            <AppText variant="label" style={{ color: accent }}>
              {tail}
            </AppText>
          </>
        ) : (
          (safety?.headline ?? 'Checking…')
        )}
      </AppText>
      {safety?.detail ? (
        <AppText
          variant="caption"
          color={selected ? 'onBrandMuted' : 'textMuted'}
          style={styles.history}
        >
          {safety.detail}
        </AppText>
      ) : null}
    </View>
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
