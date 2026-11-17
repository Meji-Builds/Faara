import { useCallback, useEffect, useState } from 'react';

import { friendlyError } from '@/lib/errors';

/** Loads a value on mount and on `reload()`. Errors become `error`; the last value is kept. */
export function useAsyncValue<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        setValue(result);
        setError(null);
      })
      .catch(
        (cause: unknown) =>
          !cancelled &&
          setError(
            friendlyError(cause, 'Couldn’t load this. Check your connection and try again.'),
          ),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load, generation]);

  const reload = useCallback(() => {
    setLoading(true);
    setGeneration((n) => n + 1);
  }, []);

  return { value, error, loading, reload };
}
