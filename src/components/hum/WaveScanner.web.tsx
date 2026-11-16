import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { rgbaToLuminance, scanWave } from '@/features/wavecode';
import { radii, useTheme } from '@/theme';

interface WaveScannerProps {
  /** Called once with the first hum code read from the camera. */
  onToken: (token: string) => void;
}

const SCAN_INTERVAL_MS = 140;
/** Frames are downscaled so the longer side is at most this many pixels. */
const MAX_SIDE = 640;

/** Web scanner: reads hum rings from the rear camera using a canvas. */
export function WaveScanner({ onToken }: WaveScannerProps) {
  const { colors } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let done = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        if (!cancelled)
          setError('Camera access is off. Allow it in your browser settings to scan.');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video || !context) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      timer = setInterval(() => {
        if (done || video.videoWidth === 0) return;
        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const token = scanWave(rgbaToLuminance(pixels, width * height), width, height);
        if (token) {
          done = true;
          onTokenRef.current(token);
        }
      }, SCAN_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) {
    return (
      <View style={styles.message}>
        <AppText color="textMuted" align="center">
          {error}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { borderColor: colors.accent }]}>
      <video
        ref={videoRef}
        playsInline
        muted
        aria-label="Camera preview"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
  message: { paddingVertical: 24 },
});
