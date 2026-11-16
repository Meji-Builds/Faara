import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ClaimHumResponse, ShapeTriple } from '@shared/hum';

import { ShapeGlyph } from '@/components/brand';
import { HumPulse } from '@/components/hum';
import { AppText, Button, Card, Header, Screen } from '@/components/ui';
import { claimHum, watchClaim, watchHum, type HumClaim, type HumState } from '@/features/hum';
import { estimateDistanceCm, useHumListener, type DecodedHum } from '@/features/sound';
import { apiErrorMessage } from '@/lib/api/client';
import { formatMoney } from '@/lib/money';
import { radii, useTheme } from '@/theme';

type Phase =
  | { kind: 'listening' }
  | { kind: 'claiming' }
  | { kind: 'claimed'; claim: ClaimHumResponse }
  | { kind: 'failed'; message: string };

/** Receiving side of a hum: listen, claim, then wait for the sender's choice. */
export default function ReceiveScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'listening' });
  const [myClaim, setMyClaim] = useState<HumClaim | null>(null);
  const [hum, setHum] = useState<HumState | null>(null);
  const claiming = useRef(false);

  const onDecode = useCallback((decoded: DecodedHum) => {
    if (claiming.current) return;
    claiming.current = true;
    setPhase({ kind: 'claiming' });
    claimHum(decoded.code, 'sound', estimateDistanceCm(decoded.frameLevel))
      .then((claim) => setPhase({ kind: 'claimed', claim }))
      .catch((cause) => setPhase({ kind: 'failed', message: apiErrorMessage(cause) }));
  }, []);

  const listener = useHumListener(onDecode);
  const { start, stop } = listener;

  // Listen while waiting for a hum; release the microphone once one is caught.
  useEffect(() => {
    if (phase.kind !== 'listening') return;
    claiming.current = false;
    start();
    return () => {
      stop();
    };
  }, [phase.kind, start, stop]);

  const paymentId = phase.kind === 'claimed' ? phase.claim.paymentId : null;
  const claimId = phase.kind === 'claimed' ? phase.claim.claimId : null;

  useEffect(() => {
    if (!paymentId || !claimId) return;
    const unsubscribeClaim = watchClaim(paymentId, claimId, setMyClaim);
    const unsubscribeHum = watchHum(paymentId, setHum);
    return () => {
      unsubscribeClaim();
      unsubscribeHum();
    };
  }, [paymentId, claimId]);

  const listenAgain = () => {
    setMyClaim(null);
    setHum(null);
    setPhase({ kind: 'listening' });
  };

  return (
    <Screen
      footer={
        phase.kind === 'failed' ||
        (phase.kind === 'claimed' &&
          (hum?.status === 'cancelled' ||
            (hum?.status === 'chosen' && hum.chosenClaimId !== claimId))) ? (
          <Button label="Listen again" onPress={listenAgain} />
        ) : myClaim?.status === 'chosen' ? (
          <Button label="Done" onPress={() => router.back()} />
        ) : null
      }
    >
      <Header center={<AppText variant="subheading">Receive</AppText>} />
      <View style={styles.body}>
        {phase.kind === 'listening' ? (
          <Listening
            state={listener.state}
            error={listener.error ?? listener.unavailableReason ?? null}
            onRetry={listener.start}
          />
        ) : phase.kind === 'claiming' ? (
          <Status busy title="Hum caught" message="Letting the sender know you’re here…" />
        ) : phase.kind === 'failed' ? (
          <Status title="Couldn’t claim that hum" message={phase.message} tone="gold" />
        ) : (
          <Claimed
            claim={phase.claim}
            myClaim={myClaim}
            hum={hum}
            claimId={claimId}
            colors={colors}
          />
        )}
      </View>
    </Screen>
  );
}

function Listening({
  state,
  error,
  onRetry,
}: {
  state: ReturnType<typeof useHumListener>['state'];
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'denied') {
    return (
      <Status
        title="Microphone is off"
        message="Faara needs the microphone to hear the sender’s hum. Allow it in your phone or browser settings, then try again."
        tone="gold"
        action={<Button label="Try again" variant="outline" onPress={onRetry} />}
      />
    );
  }
  if (state === 'error' || (state === 'idle' && error)) {
    return (
      <Status
        title="Can’t listen right now"
        message={error ?? 'The microphone could not start.'}
        tone="gold"
        action={<Button label="Try again" variant="outline" onPress={onRetry} />}
      />
    );
  }
  return (
    <View style={styles.center}>
      <HumPulse size={110} active={state === 'listening'} />
      <AppText variant="title" align="center" style={styles.title}>
        Ready to receive
      </AppText>
      <AppText color="textMuted" align="center">
        Hold your phone close to the sender’s. Faara is listening for their hum.
      </AppText>
    </View>
  );
}

function Claimed({
  claim,
  myClaim,
  hum,
  claimId,
  colors,
}: {
  claim: ClaimHumResponse;
  myClaim: HumClaim | null;
  hum: HumState | null;
  claimId: string | null;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const senderFirst = claim.sender.fullName.split(/\s+/)[0] ?? claim.sender.fullName;
  const amount = formatMoney(claim.amount, claim.currency, {
    decimals: claim.currency === 'USDC' ? 2 : undefined,
  });
  const summary = `${amount}${claim.note ? ` · ${claim.note}` : ''}`;

  if (hum?.status === 'cancelled') {
    return (
      <Status
        title={`${senderFirst} cancelled`}
        message={`The hum for ${summary} was cancelled.`}
      />
    );
  }
  if (hum?.status === 'chosen' && hum.chosenClaimId !== claimId) {
    return (
      <Status
        title={`${senderFirst} chose someone else`}
        message="Another phone nearby caught the same hum and was picked. Nothing was paid to you."
      />
    );
  }
  if (myClaim?.status === 'chosen' && myClaim.shapes) {
    return (
      <Matched
        shapes={myClaim.shapes}
        senderFirst={senderFirst}
        summary={summary}
        colors={colors}
      />
    );
  }
  return (
    <Status
      busy
      title={`Waiting for ${senderFirst}`}
      message={`${summary}. ${senderFirst} is choosing who gets paid. Keep this screen open.`}
    />
  );
}

function Matched({
  shapes,
  senderFirst,
  summary,
  colors,
}: {
  shapes: ShapeTriple;
  senderFirst: string;
  summary: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.matched}>
      <AppText variant="title" align="center" style={styles.title}>
        You were picked
      </AppText>
      <AppText color="textMuted" align="center">
        {summary}
      </AppText>
      <Card tone="brand" padded style={styles.matchCard}>
        <AppText variant="overline" color="onBrandMuted">
          MATCH WITH {senderFirst.toUpperCase()}&apos;S SCREEN
        </AppText>
        <View style={styles.shapes}>
          {shapes.map((shape, index) => (
            <View
              key={`${shape}-${index}`}
              style={[styles.shapeTile, { backgroundColor: colors.brandInset }]}
            >
              <ShapeGlyph shape={shape} size={34} />
            </View>
          ))}
        </View>
        <AppText variant="label" color="onBrand" style={styles.matchHint}>
          {senderFirst} sees the same three shapes. If they don&apos;t match, tell them to cancel.
        </AppText>
      </Card>
    </View>
  );
}

function Status({
  title,
  message,
  busy = false,
  tone = 'textMuted',
  action,
}: {
  title: string;
  message: string;
  busy?: boolean;
  tone?: 'textMuted' | 'gold';
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      {busy ? (
        <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
      ) : null}
      <AppText variant="title" align="center" style={styles.title}>
        {title}
      </AppText>
      <AppText color={tone} align="center">
        {message}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingVertical: 24 },
  center: { alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  title: { fontSize: 30, lineHeight: 36, marginTop: 8 },
  spinner: { marginBottom: 8 },
  matched: { gap: 10 },
  matchCard: { marginTop: 16, gap: 14 },
  shapes: { flexDirection: 'row', gap: 10 },
  shapeTile: {
    flex: 1,
    height: 76,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchHint: { fontSize: 14, lineHeight: 20, opacity: 0.92 },
});
