import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AssistantIntent } from '@shared/ai';

import { AiConsentCard, AnswerFeedback, LanguagePicker, MicButton } from '@/components/assistant';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { useNairaBalance } from '@/features/account';
import { askAssistant, useAiConsent, useAssistantLanguage, useSpeech } from '@/features/assistant';
import { formatMinor } from '@/features/convert';
import { useWalletUsdc } from '@/features/usdc/useWalletUsdc';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const EXAMPLES = {
  en: ['Send Tolu 5k for the fabric', 'Change ₦20,000 to dollars', 'Save 30% of what I receive'],
  pcm: ['Send 5k give Tolu for fabric', 'Change my 20k to dollar', 'Wetin dey my account?'],
  yo: ['Fi ẹgbẹ̀rún márùn-ún ránṣẹ́ sí Tolu', 'Yí ₦20,000 padà sí dọ́là'],
  ha: ['Aika wa Tolu naira dubu biyar', 'Canza naira dubu ashirin zuwa dala'],
  ig: ['Zigara Tolu puku naira ise', 'Gbanwee ₦20,000 ka ọ bụrụ dollar'],
} as const;

/** "Ask Faara": say or type what you want; Faara fills it in for you to check and approve. */
export default function AssistantScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [language, setLanguage] = useAssistantLanguage();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantIntent | null>(null);
  const aiConsent = useAiConsent();
  const naira = useNairaBalance();
  const usdcCents = useWalletUsdc().cents;

  const ask = async (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askAssistant(trimmed, language));
    } catch (cause) {
      setError(friendlyError(cause, 'Faara couldn’t answer just now. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  // When listening stops with something heard, ask straight away.
  const speech = useSpeech((heardText) => void ask(heardText));

  // Show what the phone heard as it hears it; it can be corrected before sending.
  const [heard, setHeard] = useState('');
  if (speech.transcript && speech.transcript !== heard) {
    setHeard(speech.transcript);
    setText(speech.transcript);
  }

  const act = () => {
    if (!result) return;
    switch (result.action) {
      case 'send':
        if (!result.recipient) return;
        router.push({
          pathname: '/send',
          params: {
            to: result.recipient.username,
            ...(result.amountNaira ? { amount: String(result.amountNaira) } : {}),
            ...(result.note ? { note: result.note } : {}),
          },
        });
        return;
      case 'buy_usdc':
      case 'sell_usdc': {
        const amount = result.action === 'buy_usdc' ? result.amountNaira : result.amountUsdc;
        router.push({
          pathname: '/convert',
          params: {
            from: result.action === 'buy_usdc' ? 'NGN' : 'USDC',
            ...(amount ? { amount: String(amount) } : {}),
          },
        });
        return;
      }
      case 'savings_rule':
        router.push({ pathname: '/agent', params: { text: text.trim() } });
        return;
      case 'scam_check':
        router.push('/scam-check');
        return;
      default:
    }
  };

  const actionLabel: Partial<Record<AssistantIntent['action'], string>> = {
    send: 'Review payment',
    buy_usdc: 'Review conversion',
    sell_usdc: 'Review conversion',
    savings_rule: 'Set it up',
    scam_check: 'Check a message',
  };
  const label = result ? actionLabel[result.action] : undefined;
  const canAct = Boolean(label) && !(result?.action === 'send' && !result.recipient);

  return (
    <Screen
      footer={
        <>
          {error || speech.error ? (
            <AppText variant="label" color="gold" align="center">
              {error ?? speech.error}
            </AppText>
          ) : null}
          {result && canAct && label ? (
            <Button label={label} onPress={act} />
          ) : (
            <Button
              label="Ask"
              disabled={!text.trim() || busy || speech.listening}
              loading={busy}
              onPress={() => ask(text)}
            />
          )}
          <AppText variant="caption" color="textMuted" align="center">
            Faara fills things in. Nothing moves until you approve it.
          </AppText>
        </>
      }
    >
      <Header center={<AppText variant="subheading">Ask Faara</AppText>} />
      <View style={styles.body}>
        {aiConsent.consent === null ? (
          <AiConsentCard
            onChoose={(value) => void aiConsent.choose(value).catch(() => undefined)}
          />
        ) : null}
        <LanguagePicker value={language} onChange={setLanguage} />

        <MicButton
          listening={speech.listening}
          onPress={() => (speech.listening ? speech.stop() : speech.start(language))}
        />

        <TextField
          label="Or type it"
          value={text}
          onChangeText={(next) => {
            setText(next);
            setResult(null);
          }}
          placeholder={EXAMPLES[language][0]}
          returnKeyType="send"
          onSubmitEditing={() => ask(text)}
        />

        {busy ? <ActivityIndicator color={colors.accent} /> : null}

        {result ? (
          <Card tone="brand" padded style={styles.answer}>
            <AppText color="onBrand">{result.reply}</AppText>
            {result.action === 'send' && result.recipient ? (
              <AppText variant="label" color="onBrandMuted">
                To {result.recipient.fullName} (@{result.recipient.username})
                {result.amountNaira ? ` · ${formatMoney(result.amountNaira, 'NGN')}` : ''}
                {result.note ? ` · ${result.note}` : ''}
              </AppText>
            ) : null}
            {result.action === 'balance' ? (
              <AppText variant="bodyStrong" color="onBrand">
                {naira === null ? '…' : formatMoney(naira, 'NGN', { decimals: 2 })}
                {usdcCents === null ? '' : ` · ${formatMinor(usdcCents, 'USDC')}`}
              </AppText>
            ) : null}
            {result.exampleId ? <AnswerFeedback exampleId={result.exampleId} tone="brand" /> : null}
          </Card>
        ) : !text ? (
          <View style={styles.examples}>
            <AppText variant="label" color="textMuted">
              Try saying
            </AppText>
            {EXAMPLES[language].map((example) => (
              <AppText
                key={example}
                color="accentText"
                accessibilityRole="button"
                onPress={() => {
                  setText(example);
                  void ask(example);
                }}
              >
                “{example}”
              </AppText>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20, marginTop: 16, paddingBottom: 24 },
  answer: { gap: 8 },
  examples: { gap: 8 },
});
