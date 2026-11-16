import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { humQrPayload } from '@shared/hum';

import { HumCode } from '@/components/brand';
import { AppText, Button, Header, Screen } from '@/components/ui';
import { randomCode } from '@/features/sound';

/** Developer preview of the animated hum code, for checking that scanners read it. */
export default function CodeLabScreen() {
  const [token, setToken] = useState(randomCode);
  const [animated, setAnimated] = useState(true);
  return (
    <Screen>
      <Header center={<AppText variant="subheading">Hum code</AppText>} />
      <View style={styles.body}>
        <HumCode value={humQrPayload(token)} size={280} animated={animated} />
        <AppText variant="mono" color="textMuted" accessibilityLabel="Encoded code">
          {token}
        </AppText>
        <AppText variant="label" color="textMuted" align="center">
          Scan this with Receive → Scan QR, or any QR scanner app, to check it reads while
          animating.
        </AppText>
        <Button label="New code" variant="outline" onPress={() => setToken(randomCode())} />
        <Button
          label={animated ? 'Pause animation' : 'Animate'}
          variant="text"
          onPress={() => setAnimated((a) => !a)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 16, marginTop: 24, paddingBottom: 24 },
});
