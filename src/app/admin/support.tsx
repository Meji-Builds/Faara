import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { SupportTicket } from '@shared/support';

import { TicketRow } from '@/components/support';
import { AppText, Header, Screen } from '@/components/ui';
import { supportQueue } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/** The support queue: tickets waiting for a reply first. */
export default function AdminSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      supportQueue()
        .then((result) => active && setTickets(result.tickets))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load tickets. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Support tickets</AppText>} />
      <View style={styles.body}>
        {error ? <AppText color="gold">{error}</AppText> : null}
        {tickets === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {tickets?.length === 0 ? <AppText color="textMuted">No tickets yet.</AppText> : null}
        {tickets?.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            showUser
            onPress={() => router.push({ pathname: '/support/[id]', params: { id: ticket.id } })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 16, paddingBottom: 24 },
});
