import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HumRing } from '@/components/brand';
import { WaveScanner } from '@/components/hum';
import { AppText, Button, Header, Screen, TextTabs } from '@/components/ui';
import { randomCode } from '@/features/sound';

type Mode = 'show' | 'scan';
const MODES: readonly Mode[] = ['show', 'scan'];

/** Developer bench for the hum ring: show one on this phone, scan it with another. */
export default function CodeLabScreen() {
  const [mode, setMode] = useState<Mode>('show');
  const [token, setToken] = useState(randomCode);
  const [animated, setAnimated] = useState(true);
  const [scanned, setScanned] = useState<string | null>(null);

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Hum ring</AppText>} />
      <View style={styles.tabs}>
        <TextTabs
          options={MODES}
          value={mode}
          onChange={setMode}
          labels={{ show: 'Show', scan: 'Scan' }}
        />
      </View>
      {mode === 'show' ? (
        <View style={styles.body}>
          <HumRing token={token} size={300} animated={animated} />
          <AppText variant="mono" color="textMuted" accessibilityLabel="Encoded code">
            {token}
          </AppText>
          <AppText variant="label" color="textMuted" align="center">
            Open this page on another phone, choose Scan, and point it here.
          </AppText>
          <Button label="New code" variant="outline" onPress={() => setToken(randomCode())} />
          <Button
            label={animated ? 'Pause animation' : 'Animate'}
            variant="text"
            onPress={() => setAnimated((value) => !value)}
          />
        </View>
      ) : (
        <View style={styles.body}>
          {scanned ? (
            <>
              <AppText variant="overline" color="accentText">
                READ
              </AppText>
              <AppText variant="mono" accessibilityLabel="Scanned code" style={styles.scanned}>
                {scanned}
              </AppText>
              <Button label="Scan again" variant="outline" onPress={() => setScanned(null)} />
            </>
          ) : (
            <>
              <View style={styles.scanner}>
                <WaveScanner onToken={setScanned} />
              </View>
              <AppText variant="label" color="textMuted" align="center">
                Point the camera at a hum ring.
              </AppText>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { alignItems: 'center', marginTop: 4 },
  body: { alignItems: 'center', gap: 16, marginTop: 24, paddingBottom: 24 },
  scanner: { alignSelf: 'stretch' },
  scanned: { fontSize: 28, lineHeight: 36, letterSpacing: 2 },
});
