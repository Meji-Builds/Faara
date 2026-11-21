import { useFocusEffect, useRouter } from 'expo-router';
import { LifeBuoy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { SupportTicket } from '@shared/support';

import { TicketRow } from '@/components/support';
import { AppText, Button, EmptyState, Header, Screen } from '@/components/ui';
import { myTickets } from '@/features/support';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/** The person's conversations with Faara support. */
export default function SupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      myTickets()
        .then((result) => active && setTickets(result.tickets))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load your tickets. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen footer={<Button label="Contact support" onPress={() => router.push('/support/new')} />}>
      <Header center={<AppText variant="subheading">Support</AppText>} />
      <View style={styles.body}>
        {error ? <AppText color="gold">{error}</AppText> : null}
        {tickets === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {tickets?.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy size={30} color={colors.accentText} strokeWidth={1.75} />}
            title="No conversations yet"
            message="If anything goes wrong with a payment or your account, tell us here. A real person on Faara’s team replies."
          />
        ) : null}
        {tickets?.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
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
