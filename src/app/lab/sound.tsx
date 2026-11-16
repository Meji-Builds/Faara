import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ReceivePanel } from '@/components/lab/ReceivePanel';
import { SendPanel } from '@/components/lab/SendPanel';
import { AppText, Header, Screen, TextTabs } from '@/components/ui';
import { audioEngine } from '@/features/sound';

type Mode = 'send' | 'receive';
const MODES: readonly Mode[] = ['send', 'receive'];

/**
 * Milestone 1 test bench: one phone sends a looping hum, the other listens and
 * scores each trial (decode success and time to decode).
 */
export default function SoundLabScreen() {
  const [mode, setMode] = useState<Mode>('send');

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Sound lab</AppText>} />
      <View style={styles.tabs}>
        <TextTabs
          options={MODES}
          value={mode}
          onChange={setMode}
          labels={{ send: 'Send', receive: 'Receive' }}
        />
      </View>

      {audioEngine.available ? null : (
        <AppText variant="label" color="gold" style={styles.notice}>
          {audioEngine.unavailableReason}
        </AppText>
      )}

      <View style={styles.body}>{mode === 'send' ? <SendPanel /> : <ReceivePanel />}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { alignItems: 'center', marginTop: 4 },
  notice: { marginTop: 16, textAlign: 'center' },
  body: { marginTop: 20, paddingBottom: 24 },
});
