import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: 'How does a hum work?',
    answer:
      'The sender’s phone plays a short sound nobody needs to hear and also announces itself over Bluetooth. The receiver’s phone picks it up, the sender chooses who gets paid, and both of you see the same three shapes before the money moves.',
  },
  {
    question: 'The other phone isn’t catching my hum',
    answer:
      'Hold the phones about a foot apart, turn the volume up, and make sure Bluetooth is on for both. In a loud place, the receiver can scan the hum ring on your screen or type the 6-digit code instead.',
  },
  {
    question: 'Why does Faara ask for the microphone?',
    answer:
      'Only to hear a hum from someone paying you. It listens while Faara is open on the Home screen, and never records or stores audio. You can turn this off in Settings.',
  },
  {
    question: 'How do I add money?',
    answer:
      'On Home tap Add money, enter an amount and pay by card or bank transfer on the secure Paystack page. Your balance updates as soon as the payment is confirmed.',
  },
  {
    question: 'I paid but my balance didn’t change',
    answer:
      'Bank transfers can take a minute or two. Open Add money again and it will check. If it still hasn’t arrived after ten minutes, tap Contact support below.',
  },
  {
    question: 'I forgot my PIN',
    answer:
      'Your PIN protects your wallet and approves payments, so it can’t be reset from here. Log out and log back in with your phone number; you can set up the wallet again from your recovery phrase.',
  },
];

/** Answers to the questions people ask most. */
export default function HelpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen
      footer={
        <>
          <Button label="Contact support" onPress={() => router.push('/support/new')} />
          <Button
            label="My conversations with support"
            variant="text"
            onPress={() => router.push('/support')}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">Help and support</AppText>} />
      <View style={styles.list}>
        {QUESTIONS.map((item, index) => {
          const expanded = open === index;
          const Chevron = expanded ? ChevronUp : ChevronDown;
          return (
            <Card key={item.question} padded>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : index)}
                style={styles.question}
              >
                <AppText variant="bodyStrong" style={styles.questionText}>
                  {item.question}
                </AppText>
                <Chevron size={20} color={colors.textMuted} strokeWidth={1.75} />
              </Pressable>
              {expanded ? (
                <AppText color="textMuted" style={styles.answer}>
                  {item.answer}
                </AppText>
              ) : null}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 16, paddingBottom: 24 },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  questionText: { flex: 1 },
  answer: { marginTop: 10, lineHeight: 22 },
});
