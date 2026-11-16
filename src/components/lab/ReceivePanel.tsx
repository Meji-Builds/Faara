import { CircleCheck, CircleX } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Meter, TextField } from '@/components/ui';
import {
  scoreTrial,
  summarize,
  TARGET_LATENCY_MS,
  TRIAL_TIMEOUT_MS,
  useHumListener,
  type DecodedHum,
  type TrialResult,
} from '@/features/sound';
import { fonts, useTheme } from '@/theme';

/** Sync correlation needed to start decoding a frame (matches the receiver default). */
const SYNC_THRESHOLD = 0.3;
const HISTORY_LENGTH = 10;

interface ActiveTrial {
  id: number;
  startedAt: number;
}

export function ReceivePanel() {
  const { colors } = useTheme();
  const [expected, setExpected] = useState('');
  const [trial, setTrial] = useState<ActiveTrial | null>(null);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const nextId = useRef(1);

  const trialRef = useRef(trial);
  const expectedRef = useRef(expected);
  useEffect(() => {
    trialRef.current = trial;
    expectedRef.current = expected;
  }, [trial, expected]);

  const finish = useCallback((decoded: DecodedHum | null) => {
    const active = trialRef.current;
    if (!active) return;
    trialRef.current = null;
    const latency = Date.now() - active.startedAt;
    setResults((prev) => [scoreTrial(active.id, decoded, latency, expectedRef.current), ...prev]);
    setTrial(null);
  }, []);

  const listener = useHumListener(useCallback((hum: DecodedHum) => finish(hum), [finish]));
  const listening = listener.state === 'listening';

  const beginTrial = useCallback(() => {
    listener.restart();
    const next = { id: nextId.current++, startedAt: Date.now() };
    trialRef.current = next;
    setTrial(next);
  }, [listener]);

  // Start the first trial as soon as the microphone is live.
  useEffect(() => {
    if (listening && results.length === 0 && !trialRef.current) beginTrial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when listening starts
  }, [listening]);

  // Tick the elapsed timer and enforce the trial timeout.
  useEffect(() => {
    if (!trial) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - trial.startedAt >= TRIAL_TIMEOUT_MS) finish(null);
    }, 100);
    return () => clearInterval(timer);
  }, [trial, finish]);

  const latest = results[0];
  const summary = summarize(results);
  const { meters } = listener;

  return (
    <View style={styles.panel}>
      <TextField
        label="Expected code (optional)"
        value={expected}
        onChangeText={(text) => setExpected(text.toUpperCase().replace(/\s/g, '').slice(0, 10))}
        placeholder="Type the sender's code to score matches"
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Card padded style={styles.trialCard}>
        {trial ? (
          <>
            <AppText variant="overline" color="textMuted">
              TRIAL {trial.id} · LISTENING
            </AppText>
            <AppText style={[styles.big, { color: colors.textMuted }]}>
              {((now - trial.startedAt) / 1000).toFixed(1)}s
            </AppText>
          </>
        ) : latest ? (
          <>
            <View style={styles.resultHeader}>
              {latest.passed ? (
                <CircleCheck size={20} color={colors.accentText} strokeWidth={2} />
              ) : (
                <CircleX size={20} color={colors.gold} strokeWidth={2} />
              )}
              <AppText variant="overline" color={latest.passed ? 'accentText' : 'gold'}>
                TRIAL {latest.id} · {latest.passed ? 'PASS' : 'FAIL'}
              </AppText>
            </View>
            <AppText style={[styles.big, { color: colors.text }]}>
              {latest.code ?? 'No code'}
            </AppText>
            <AppText variant="body" color="textMuted">
              {latest.code
                ? `${latest.latencyMs} ms · ${latest.correctedSymbols} symbol${latest.correctedSymbols === 1 ? '' : 's'} corrected`
                : `Nothing decoded in ${TRIAL_TIMEOUT_MS / 1000}s`}
            </AppText>
          </>
        ) : (
          <AppText color="textMuted">
            Start humming on the other phone, hold the phones about 30 cm apart, then start
            listening here.
          </AppText>
        )}
      </Card>

      {listening ? (
        <Card padded style={styles.meters}>
          <AppText variant="caption" color="textMuted">
            {listener.inputDescription}
          </AppText>
          <Meter
            label="18–20 kHz level"
            value={Math.min(1, meters.bandLevel * 20)}
            readout={meters.bandLevel.toFixed(4)}
          />
          <Meter
            label="Sync"
            value={meters.syncPeak}
            readout={meters.syncPeak.toFixed(2)}
            marker={SYNC_THRESHOLD}
          />
          <AppText variant="caption" color="textMuted">
            Frames detected {meters.framesDetected} · failed {meters.framesFailed}
          </AppText>
        </Card>
      ) : null}

      {summary.total > 0 ? (
        <Card padded style={styles.summary}>
          <AppText variant="subheading">
            {summary.passed} of {summary.total} passed
            <AppText color="textMuted"> (target 9 of 10 under {TARGET_LATENCY_MS / 1000}s)</AppText>
          </AppText>
          <AppText variant="body" color="textMuted">
            Median {summary.medianMs ?? '–'} ms · max {summary.maxMs ?? '–'} ms
          </AppText>
          {results.slice(0, HISTORY_LENGTH).map((result) => (
            <View key={result.id} style={styles.historyRow}>
              <AppText variant="mono" color="textMuted" style={styles.historyId}>
                #{result.id}
              </AppText>
              <AppText variant="mono" style={styles.historyCode}>
                {result.code ?? '—'}
              </AppText>
              <AppText variant="mono" color="textMuted">
                {result.code ? `${result.latencyMs} ms` : 'timeout'}
              </AppText>
              <AppText variant="mono" color={result.passed ? 'accentText' : 'gold'}>
                {result.passed ? 'PASS' : 'FAIL'}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {listener.state === 'denied' ? (
        <AppText variant="label" color="gold" align="center">
          Microphone access was denied. Allow it in system settings to receive.
        </AppText>
      ) : null}
      {listener.error ? (
        <AppText variant="label" color="gold" align="center">
          {listener.error}
        </AppText>
      ) : null}

      {listening ? (
        <View style={styles.actions}>
          <Button label={trial ? 'Restart trial' : 'Next trial'} onPress={beginTrial} />
          <Button label="Stop listening" variant="text" onPress={listener.stop} />
        </View>
      ) : (
        <Button
          label="Start listening"
          loading={listener.state === 'starting'}
          disabled={!listener.available}
          onPress={listener.start}
        />
      )}
      {results.length > 0 && !listening ? (
        <Button label="Clear results" variant="text" onPress={() => setResults([])} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  trialCard: { gap: 6, minHeight: 120, justifyContent: 'center' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { fontFamily: fonts.mono, fontSize: 30, lineHeight: 38, letterSpacing: 2 },
  meters: { gap: 12 },
  summary: { gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyId: { width: 36 },
  historyCode: { flex: 1 },
  actions: { gap: 4 },
});
