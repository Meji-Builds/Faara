import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { CreateTransferResponse } from '@shared/hum';
import { REQUEST_ID } from '@shared/requests';

import { SuccessBurst } from '@/components/brand';
import { ApprovalFooter, PaymentHeader } from '@/components/payments';
import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth';
import {
  createTransfer,
  usePayFlow,
  type PaymentToSettle,
  type Settlement,
} from '@/features/payments';
import {
  cancelRequest,
  getRequest,
  naira,
  STATUS_LABEL,
  type RequestView,
} from '@/features/requests';
import { useWallet } from '@/features/wallet';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** One payment request: pay it, or (if it's yours) see its status and cancel it. */
export default function RequestScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = String(raw ?? '');
  const { colors } = useTheme();
  const { status } = useAuth();
  const { status: walletStatus } = useWallet();

  if (!REQUEST_ID.test(id)) return <Redirect href="/" />;
  if (status === 'loading' || (status === 'ready' && walletStatus === 'loading')) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (status !== 'ready' || walletStatus !== 'ready') return <SignInFirst />;
  return <RequestDetail id={id} />;
}

function SignInFirst() {
  const router = useRouter();
  return (
    <Screen
      footer={
        <>
          <Button label="Log in" onPress={() => router.push('/log-in')} />
          <Button
            label="Create account"
            variant="outline"
            onPress={() => router.push('/sign-up')}
          />
        </>
      }
    >
      <View style={styles.message}>
        <AppText variant="title" align="center">
          Someone sent you an invoice
        </AppText>
        <AppText color="textMuted" align="center">
          Log in to Faara to see it and pay. Then open the link again.
        </AppText>
      </View>
    </Screen>
  );
}

function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [request, setRequest] = useState<RequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<CreateTransferResponse | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequest(await getRequest(id));
      setError(null);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t open this invoice. Try again.'));
    }
  }, [id]);

  useEffect(() => {
    // Load the invoice once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const amount = request ? request.amountKobo / 100 : 0;
  const payment = useMemo<PaymentToSettle | null>(
    () =>
      transfer && request
        ? {
            paymentId: transfer.paymentId,
            currency: 'NGN',
            amountMinor: request.amountKobo,
            recipientWallet: null,
            approvalReason: `Pay ${naira(request.amountKobo)} to ${request.requester.fullName}`,
          }
        : null,
    [transfer, request],
  );
  const onSettled = useCallback((result: Settlement) => {
    haptics.success();
    setSettlement(result);
  }, []);
  const flow = usePayFlow(payment, onSettled);

  const startPaying = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      setTransfer(
        await createTransfer(request.requester.username, amount, 'NGN', request.note, request.id),
      );
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t start the payment. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelRequest(id);
      await load();
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t cancel it. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (settlement && request) {
    return (
      <Screen footer={<Button label="Done" onPress={() => router.replace('/invoices')} />}>
        <View style={styles.message}>
          <SuccessBurst size={104} />
          <AppText variant="title" align="center">
            Paid {naira(request.amountKobo)}
          </AppText>
          <AppText color="textMuted" align="center">
            to {request.requester.fullName} for {request.note}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen>
        <Header center={<AppText variant="subheading">Invoice</AppText>} />
        {error ? (
          <AppText color="gold" style={styles.gap}>
            {error}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.gap} />
        )}
      </Screen>
    );
  }

  // Approving the payment.
  if (transfer) {
    return (
      <Screen
        footer={
          <ApprovalFooter
            flow={flow}
            amountLabel={naira(request.amountKobo)}
            currency="NGN"
            secondary={
              <Button
                label="Back"
                variant="text"
                disabled={flow.stage === 'paying'}
                onPress={() => setTransfer(null)}
              />
            }
          />
        }
      >
        <Header center={<AppText variant="subheading">Pay invoice</AppText>} />
        <PaymentHeader
          recipientName={request.requester.fullName}
          amount={amount}
          currency="NGN"
          note={request.note}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          {request.canPay ? (
            <Button
              label={`Pay ${naira(request.amountKobo)}`}
              loading={busy}
              onPress={startPaying}
            />
          ) : null}
          {request.mine && request.status === 'open' ? (
            <Button label="Cancel invoice" variant="outline" loading={busy} onPress={cancel} />
          ) : null}
        </>
      }
    >
      <Header center={<AppText variant="subheading">Invoice</AppText>} />
      <Card padded style={styles.card}>
        <AppText variant="label" color="textMuted">
          {request.mine ? 'You asked for' : `${request.requester.fullName} is asking for`}
        </AppText>
        <AppText variant="title">{naira(request.amountKobo)}</AppText>
        <AppText variant="bodyStrong">{request.note}</AppText>
        <AppText color="textMuted">
          {request.mine
            ? request.from
              ? `From ${request.from.fullName} (@${request.from.username})`
              : 'From anyone with the link'
            : `@${request.requester.username}`}
        </AppText>
        <AppText
          variant="bodyStrong"
          color={
            request.status === 'paid'
              ? 'accentText'
              : request.status === 'open'
                ? 'gold'
                : 'textMuted'
          }
        >
          {STATUS_LABEL[request.status]}
          {request.status === 'paid' && request.paidAt
            ? ` · ${request.paidBy ? `by ${request.paidBy.fullName}, ` : ''}${when(request.paidAt)}`
            : request.status === 'open'
              ? ` · until ${when(request.expiresAt)}`
              : ''}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  gap: { marginTop: 24 },
  card: { gap: 8, marginTop: 20 },
});
