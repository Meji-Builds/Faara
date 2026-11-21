import type { ApplicationForReview, VendorApplicationInput, VendorStatus } from '@shared/vendors';

import { postJson } from '@/lib/api/client';

export function getVendorStatus() {
  return postJson<VendorStatus>('/api/users/vendor', {}, { retry: true });
}

export function applyToBeVendor(application: VendorApplicationInput) {
  return postJson<VendorStatus>('/api/users/apply', application);
}

export function listApplications() {
  return postJson<{ applications: ApplicationForReview[] }>('/api/users/applications', {});
}

export function reviewApplication(uid: string, approve: boolean, reason: string) {
  return postJson<{ ok: true }>('/api/users/review', { uid, approve, reason });
}
