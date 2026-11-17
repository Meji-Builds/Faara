import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { AppText } from '@/components/ui';

type TextProps = Omit<React.ComponentProps<typeof AppText>, 'children'>;

interface CountUpProps extends TextProps {
  value: number;
  format: (value: number) => string;
  delay?: number;
  duration?: number;
}

/** A number that counts up to its value, so an amount arrives rather than just appears. */
export function CountUp({ value, format, delay = 0, duration = 900, ...text }: CountUpProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value: p }) => setShown(value * p));
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(id);
    };
  }, [progress, value, delay, duration]);

  return <AppText {...text}>{format(shown)}</AppText>;
}
