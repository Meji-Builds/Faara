import { useLocalSearchParams } from 'expo-router';
import { Bot, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AgentLogEntry, MoneyRule, RuleDraft } from '@shared/ai';

import { LanguagePicker, MicButton } from '@/components/assistant';
import { Approve } from '@/components/security/Approve';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import {
  draftRule,
  getRules,
  removeRule,
  saveRule,
  useAssistantLanguage,
  useSpeech,
} from '@/features/assistant';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

const STATUS_LABEL: Record<AgentLogEntry['status'], string> = {
  done: 'Saved',
  pending: 'Confirming',
  skipped: 'Skipped',
};

/** The money agent: savings rules in plain words that move naira into dollars automatically. */
export default function AgentScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ text?: string }>();
  const [language, setLanguage] = useAssistantLanguage();
  const [text, setText] = useState(params.text ?? '');
  const [rules, setRules] = useState<MoneyRule[] | null>(null);
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getRules();
      setRules(result.rules);
      setLog(result.log);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t load your rules. Try again.'));
    }
  }, []);

  useEffect(() => {
    // Load the saved rules once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const understand = async (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    setQuestion(null);
    try {
      const result = await draftRule(trimmed, language);
      setDraft(result.draft);
      if (!result.draft) setQuestion(result.question);
    } catch (cause) {
      setError(friendlyError(cause, 'Faara couldn’t read that rule. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const speech = useSpeech((heard) => {
    setText(heard);
    void understand(heard);
  });

  const remove = async (id: string) => {
    try {
      await removeRule(id);
      haptics.success();
      await load();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t remove that rule. Try again.'));
    }
  };

  return (
    <Screen
      footer={
        draft ? (
          <>
            <Approve
              reason={`Start this rule: ${draft.summary}`}
              onApproved={async () => {
                await saveRule(draft);
                haptics.success();
                setDraft(null);
                setText('');
                await load();
              }}
            />
            <Button label="Change it" variant="text" onPress={() => setDraft(null)} />
          </>
        ) : (
          <>
            {error || speech.error ? (
              <AppText variant="label" color="gold" align="center">
                {error ?? speech.error}
              </AppText>
            ) : null}
            <Button
              label="Set up this rule"
              disabled={!text.trim() || busy || speech.listening}
              loading={busy}
              onPress={() => understand(text)}
            />
          </>
        )
      }
    >
      <Header center={<AppText variant="subheading">Money agent</AppText>} />
      <View style={styles.body}>
        <Card tone="brand" padded style={styles.intro}>
          <View style={styles.introTop}>
            <Bot size={20} color={colors.onBrandMuted} strokeWidth={1.75} />
            <AppText variant="overline" color="onBrandMuted">
              SAVES IN DOLLARS FOR YOU
            </AppText>
          </View>
          <AppText color="onBrand">
            Tell Faara how you want to save. It moves naira into USDC on its own, exactly as you
            approved, and tells you each time.
          </AppText>
        </Card>

        {draft ? (
          <Card padded style={styles.draft}>
            <AppText variant="label" color="textMuted">
              Faara understood
            </AppText>
            <AppText variant="subheading">{draft.summary}</AppText>
            <AppText color="textMuted">
              Approve to turn it on. You can remove it at any time.
            </AppText>
          </Card>
        ) : (
          <>
            <LanguagePicker value={language} onChange={setLanguage} />
            <MicButton
              listening={speech.listening}
              label="Say your rule"
              onPress={() => (speech.listening ? speech.stop() : speech.start(language))}
            />
            <TextField
              label="Or type it"
              value={speech.listening ? speech.transcript : text}
              onChangeText={(next) => {
                setText(next);
                setQuestion(null);
              }}
              placeholder="Save 30% of everything I receive"
            />
            {question ? <AppText color="gold">{question}</AppText> : null}
          </>
        )}

        <View>
          <AppText variant="overline" color="textMuted" style={styles.section}>
            YOUR RULES
          </AppText>
          {rules === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : rules.length === 0 ? (
            <AppText color="textMuted">No rules yet.</AppText>
          ) : (
            rules.map((rule) => (
              <View key={rule.id} style={[styles.rule, { borderColor: colors.border }]}>
                <View style={styles.ruleText}>
                  <AppText variant="bodyStrong">{rule.summary}</AppText>
                  {rule.kind === 'save_fixed' && rule.nextRunAt ? (
                    <AppText variant="label" color="textMuted">
                      Next: {when(rule.nextRunAt)}
                    </AppText>
                  ) : rule.kind === 'save_percent' && rule.carryKobo ? (
                    <AppText variant="label" color="textMuted">
                      {naira(rule.carryKobo)} waiting to reach ₦100
                    </AppText>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove rule"
                  hitSlop={10}
                  onPress={() => remove(rule.id)}
                >
                  <Trash2 size={20} color={colors.textMuted} strokeWidth={1.75} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {log.length > 0 ? (
          <View>
            <AppText variant="overline" color="textMuted" style={styles.section}>
              WHAT THE AGENT DID
            </AppText>
            {log.map((entry) => (
              <View key={entry.id} style={[styles.rule, { borderColor: colors.border }]}>
                <View style={styles.ruleText}>
                  <AppText variant="bodyStrong">
                    {STATUS_LABEL[entry.status]} {naira(entry.amountKobo)}
                  </AppText>
                  <AppText variant="label" color="textMuted">
                    {entry.reason || entry.summary} · {when(entry.createdAt)}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, marginTop: 16, paddingBottom: 24 },
  intro: { gap: 8 },
  introTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draft: { gap: 8 },
  section: { marginBottom: 6 },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ruleText: { flex: 1, gap: 2 },
});
