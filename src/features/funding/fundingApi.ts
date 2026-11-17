import type { InitializeFundingResponse, VerifyFundingResponse } from '@shared/hum';

import { postJson } from '@/lib/api/client';

export function initializeFunding(amount: number, platform: 'web' | 'native') {
  return postJson<InitializeFundingResponse>('/api/funding/initialize', { amount, platform });
}

export function verifyFunding(reference: string) {
  return postJson<VerifyFundingResponse>('/api/funding/verify', { reference });
}
