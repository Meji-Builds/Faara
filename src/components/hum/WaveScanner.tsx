import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { parseHumQr } from '@shared/hum';

import { AppText, Button } from '@/components/ui';
import { base64ToBytes } from '@/features/sound/audio/pcm';
import { rgbaToLuminance, scanWave } from '@/features/wavecode';
import { radii, useTheme } from '@/theme';

interface WaveScannerProps {
  /** Called once with the first hum code read from the camera. */
  onToken: (token: string) => void;
}

/** Width that captured frames are reduced to before decoding. */
const FRAME_WIDTH = 480;
const PAUSE_BETWEEN_FRAMES_MS = 150;

/**
 * Native scanner: reads hum rings by taking quiet, low-quality stills in a loop, shrinking
 * them and decoding the pixels in JavaScript (expo-camera exposes no live frames). Expect
 * roughly one attempt per second. Plain Faara QR codes are still accepted.
 */
export function WaveScanner({ onToken }: WaveScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const done = useRef(false);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const granted = permission?.granted ?? false;

  useEffect(() => {
    if (!granted) return;
    let cancelled = false;
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    (async () => {
      await pause(600); // let the camera start
      while (!cancelled && !done.current) {
        try {
          const photo = await camera.current?.takePictureAsync({
            quality: 0.4,
            skipProcessing: true,
            shutterSound: false,
          });
          if (photo && !cancelled) {
            const image = await ImageManipulator.manipulate(photo.uri)
              .resize({ width: FRAME_WIDTH })
              .renderAsync();
            const saved = await image.saveAsync({
              format: SaveFormat.JPEG,
              compress: 0.7,
              base64: true,
            });
            if (saved.base64) {
              const frame = decodeJpeg(base64ToBytes(saved.base64), {
                useTArray: true,
                formatAsRGBA: true,
              });
              const token = scanWave(
                rgbaToLuminance(frame.data, frame.width * frame.height),
                frame.width,
                frame.height,
              );
              if (token && !done.current && !cancelled) {
                done.current = true;
                onTokenRef.current(token);
                return;
              }
            }
          }
        } catch {
          // Camera busy or frame unreadable: try again.
        }
        await pause(PAUSE_BETWEEN_FRAMES_MS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [granted]);

  if (!permission) return null;

  if (!granted) {
    return (
      <View style={styles.message}>
        <AppText color="textMuted" align="center">
          {permission.canAskAgain
            ? 'Allow camera access to scan the sender’s hum ring.'
            : 'Camera access is off. Turn it on in your phone settings.'}
        </AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" variant="outline" onPress={requestPermission} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.frame, { borderColor: colors.accent }]}>
      <CameraView
        ref={camera}
        style={styles.camera}
        facing="back"
        animateShutter={false}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          const token = parseHumQr(data);
          if (!token || done.current) return;
          done.current = true;
          onTokenRef.current(token);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  camera: { flex: 1 },
  message: { gap: 16, alignItems: 'center', paddingVertical: 24 },
});
