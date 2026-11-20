import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { sendAnswerFeedback } from '@/features/assistant';
import { useTheme } from '@/theme';

/** "Was this right?" on an answer that was kept, so training knows good from bad. */
export function AnswerFeedback({
  exampleId,
  tone = 'surface',
}: {
  exampleId: string;
  tone?: 'surface' | 'brand';
}) {
  const { colors } = useTheme();
  const [sent, setSent] = useState<boolean | null>(null);
  const muted = tone === 'brand' ? colors.onBrandMuted : colors.textMuted;

  const send = (good: boolean) => {
    setSent(good);
    sendAnswerFeedback(exampleId, good).catch(() => setSent(null));
  };

  if (sent !== null) {
    return (
      <AppText variant="label" color={tone === 'brand' ? 'onBrandMuted' : 'textMuted'}>
        Thanks, that helps Faara learn.
      </AppText>
    );
  }
  return (
    <View style={styles.row}>
      <AppText variant="label" color={tone === 'brand' ? 'onBrandMuted' : 'textMuted'}>
        Was this right?
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Yes"
        hitSlop={8}
        onPress={() => send(true)}
      >
        <ThumbsUp size={18} color={muted} strokeWidth={1.75} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="No"
        hitSlop={8}
        onPress={() => send(false)}
      >
        <ThumbsDown size={18} color={muted} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
