import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CATEGORY_LABELS, type SupportTicket, type TicketMessage } from '@shared/support';

import { TICKET_STATUS_LABEL } from '@/components/support';
import { AppText, Button, Header, Screen, TextField } from '@/components/ui';
import { useIsAdmin } from '@/features/admin';
import { getThread, replyToTicket, setTicketStatus } from '@/features/support';
import { friendlyError } from '@/lib/errors';
import { radii, useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * One support conversation. The person sees their thread and replies; Faara's team sees
 * the same thread with the account link and status controls.
 */
export default function TicketScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = String(id ?? '');
  const isAdmin = useIsAdmin();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const thread = await getThread(ticketId);
      setTicket(thread.ticket);
      setMessages(thread.messages);
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t open this conversation. Try again.'));
    }
  }, [ticketId]);

  useEffect(() => {
    // Load the conversation once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await replyToTicket(ticketId, reply.trim());
      setReply('');
      await load();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t send that. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const mark = async (status: 'open' | 'closed') => {
    setBusy(true);
    try {
      setTicket(await setTicketStatus(ticketId, status));
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t change the status. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        ticket ? (
          <>
            {error ? (
              <AppText variant="label" color="gold" align="center">
                {error}
              </AppText>
            ) : null}
            <TextField
              label={isAdmin ? 'Reply as Faara support' : 'Reply'}
              value={reply}
              onChangeText={setReply}
              placeholder="Write a message"
              multiline
            />
            <Button label="Send" disabled={reply.trim().length < 5} loading={busy} onPress={send} />
            {isAdmin ? (
              <Button
                label={ticket.status === 'closed' ? 'Reopen ticket' : 'Close ticket'}
                variant="text"
                onPress={() => mark(ticket.status === 'closed' ? 'open' : 'closed')}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      <Header center={<AppText variant="subheading">Support</AppText>} />
      {!ticket ? (
        error ? (
          <AppText color="gold" style={styles.gap}>
            {error}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.gap} />
        )
      ) : (
        <View style={styles.body}>
          <AppText variant="subheading">{ticket.subject}</AppText>
          <AppText variant="label" color="textMuted">
            {CATEGORY_LABELS[ticket.category]} · {TICKET_STATUS_LABEL[ticket.status]}
            {ticket.paymentId ? ` · Payment ${ticket.paymentId}` : ''}
          </AppText>
          {isAdmin ? (
            <Button
              label={`${ticket.user.fullName} (@${ticket.user.username})`}
              variant="outline"
              onPress={() =>
                router.push({ pathname: '/admin/users', params: { q: ticket.user.username } })
              }
            />
          ) : null}
          <View style={styles.messages}>
            {messages.map((message) => {
              const mine = isAdmin ? message.from === 'faara' : message.from === 'user';
              return (
                <View
                  key={message.id}
                  style={[
                    styles.bubble,
                    mine ? styles.mine : styles.theirs,
                    {
                      backgroundColor: mine ? colors.surfaceMuted : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="label"
                    color={message.from === 'faara' ? 'accentText' : 'textMuted'}
                  >
                    {message.authorName} · {when(message.at)}
                  </AppText>
                  <AppText>{message.text}</AppText>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  body: { gap: 10, marginTop: 16, paddingBottom: 24 },
  messages: { gap: 10, marginTop: 8 },
  bubble: { maxWidth: '88%', gap: 4, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
});
