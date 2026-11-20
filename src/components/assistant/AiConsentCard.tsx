import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';

/** Asks once whether Faara may keep anonymised examples to improve its AI. */
export function AiConsentCard({ onChoose }: { onChoose: (consent: boolean) => void }) {
  return (
    <Card padded style={styles.card}>
      <AppText variant="bodyStrong">Help Faara understand Nigerians better?</AppText>
      <AppText color="textMuted">
        Let Faara keep what you ask it, with names, numbers, accounts and links removed, to train
        its own AI for Pidgin, Yorùbá, Hausa, Igbo and local scams. Screenshots are never kept, and
        nothing is tied to your account. Turn it off any time in Settings, and what was kept is
        deleted.
      </AppText>
      <View style={styles.actions}>
        <Button
          label="Not now"
          variant="outline"
          onPress={() => onChoose(false)}
          style={styles.flex}
        />
        <Button label="Yes, help" onPress={() => onChoose(true)} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
