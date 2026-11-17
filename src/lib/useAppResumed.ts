import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Counter that increases each time the app returns to the foreground. */
export function useAppResumed(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setCount((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);
  return count;
}
