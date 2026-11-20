import { useCallback, useEffect, useState } from 'react';

import { getAiConsent, setAiConsent } from './assistantApi';

/**
 * Whether the person lets Faara keep anonymised examples to improve its AI.
 * `undefined` while loading, `null` if they haven't been asked yet.
 */
export function useAiConsent() {
  const [consent, setConsent] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getAiConsent()
      .then((result) => active && setConsent(result.consent))
      .catch(() => active && setConsent(undefined));
    return () => {
      active = false;
    };
  }, []);

  const choose = useCallback(async (value: boolean) => {
    setConsent(value);
    try {
      await setAiConsent(value);
    } catch {
      setConsent(undefined);
      throw new Error('Couldn’t save that. Try again.');
    }
  }, []);

  return { consent, choose };
}
