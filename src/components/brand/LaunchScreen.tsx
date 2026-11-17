import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';

const WORDMARK = require('../../../assets/images/wordmark.png') as number;

/** Matches the native splash screen and the web placeholder, so the hand-over is seamless. */
export const LAUNCH_BACKGROUND = '#EAF7F2';
const INK = '#0B3D2E';
const WORDMARK_WIDTH = 170;
const WORDMARK_HEIGHT = Math.round((WORDMARK_WIDTH * 249) / 731);

const BAR_PEAKS = [0.35, 0.6, 0.85, 0.55, 1, 0.55, 0.85, 0.6, 0.35];
const BAR_HEIGHT = 30;
const MIN_VISIBLE_MS = 1700;
const EXIT_MS = 420;

interface LaunchScreenProps {
  /** True once the app behind is ready to be shown. */
  ready: boolean;
  /** Called when the first frame is on screen (time to hide the native splash). */
  onShown?: () => void;
  /** Called after the exit animation; the screen can be unmounted. */
  onDone: () => void;
}

/**
 * Opening animation: the wordmark settles, a hum travels along the bars beneath it,
 * then the screen lifts away to reveal the app.
 */
export function LaunchScreen({ ready, onShown, onDone }: LaunchScreenProps) {
  const [intro] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const [bars] = useState(() => BAR_PEAKS.map(() => new Animated.Value(0)));
  const [minElapsed, setMinElapsed] = useState(false);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 70),
          Animated.timing(bar, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((BAR_PEAKS.length - index) * 70),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => {
      clearTimeout(timer);
      loops.forEach((loop) => loop.stop());
    };
  }, [intro, bars]);

  const leaving = ready && minElapsed;
  useEffect(() => {
    if (!leaving) return;
    Animated.timing(exit, {
      toValue: 1,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => done.current());
  }, [leaving, exit]);

  return (
    <Animated.View
      onLayout={onShown}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityLabel="Faara is opening"
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      ]}
    >
      <Animated.View
        style={{
          transform: [
            { scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
            { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        }}
      >
        <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
        <Animated.View
          style={[
            styles.bars,
            {
              opacity: intro,
              transform: [
                { translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          {bars.map((bar, index) => (
            <Animated.View
              key={index}
              style={[
                styles.bar,
                {
                  transform: [
                    {
                      scaleY: bar.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.18, BAR_PEAKS[index] ?? 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: LAUNCH_BACKGROUND, alignItems: 'center', justifyContent: 'center' },
  wordmark: { width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT },
  // Positioned out of flow so the wordmark stays exactly where the splash screen drew it.
  bars: {
    position: 'absolute',
    top: WORDMARK_HEIGHT + 22,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bar: { width: 5, height: BAR_HEIGHT, borderRadius: 3, backgroundColor: INK },
});
