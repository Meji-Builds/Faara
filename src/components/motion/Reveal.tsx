import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

interface RevealProps {
  children: ReactNode;
  /** Wait this long before appearing (use index * 80 to stagger a list). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fades and lifts its content into place when it first appears. */
export function Reveal({ children, delay = 0, style }: RevealProps) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
