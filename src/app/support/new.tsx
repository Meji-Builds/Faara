import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  CATEGORY_LABELS,
  MAX_MESSAGE,
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from '@shared/support';

import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { openTicket } from '@/features/support';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { radii, useTheme } from '@/theme';

/** Tell Faara's team about a problem. Opened from Help, or from a receipt (with the payment). */
export default function NewTicketScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ paymentId?: string }>();
  const paymentId =
    params.paymentId && /^[A-Za-z0-9_-]{4,64}$/.test(params.paymentId) ? params.paymentId : null;
  const [category, setCategory] = useState<SupportCategory | null>(paymentId ? 'payment' : null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await openTicket(category, message.trim(), paymentId);
      haptics.success();
      router.replace({ pathname: '/support/[id]', params: { id: ticket.id } });
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t send that. Try again.'));
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
            label="Send to Faara"
            disabled={!category || message.trim().length < 5}
            loading={busy}
            onPress={send}
          />
        </>
      }
    >
      <Header center={<AppText variant="subheading">Contact support</AppText>} />
      <View style={styles.body}>
        {paymentId ? (
          <Card padded>
            <AppText variant="label" color="textMuted">
              About payment {paymentId}
            </AppText>
          </Card>
        ) : null}
        <AppText variant="label" color="textMuted">
          What’s it about?
        </AppText>
        <View style={styles.options}>
          {SUPPORT_CATEGORIES.map((option) => {
            const selected = option === category;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(option)}
                style={[
                  styles.option,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <AppText variant="bodyStrong" color={selected ? 'onAccent' : 'text'}>
                  {CATEGORY_LABELS[option]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <TextField
          label="Tell us what happened"
          value={message}
          onChangeText={(text) => setMessage(text.slice(0, MAX_MESSAGE))}
          placeholder="What you did, what you expected, and what happened instead"
          multiline
        />
        <AppText variant="caption" color="textMuted">
          Faara will never ask for your PIN, OTP or recovery phrase. Don’t share them here.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, marginTop: 16, paddingBottom: 24 },
  options: { gap: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: radii.lg, borderWidth: 1 },
});
