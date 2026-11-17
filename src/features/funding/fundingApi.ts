import type { InitializeFundingResponse, VerifyFundingResponse } from '@shared/hum';

import { DEMO, demoApi } from '@/features/demo/engine';
import { postJson } from '@/lib/api/client';

export function initializeFunding(amount: number, platform: 'web' | 'native') {
  if (DEMO) {
    demoApi.setPendingFunding(amount);
    return Promise.resolve(demoApi.initializeFunding());
  }
  return postJson<InitializeFundingResponse>('/api/funding/initialize', { amount, platform });
}

export function verifyFunding(reference: string) {
  if (DEMO)
    return new Promise<VerifyFundingResponse>((r) =>
      setTimeout(() => r(demoApi.verifyFunding()), 900),
    );
  return postJson<VerifyFundingResponse>('/api/funding/verify', { reference });
}
