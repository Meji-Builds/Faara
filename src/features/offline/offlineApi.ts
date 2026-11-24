import type { NoteResult, SignedCertificate, SignedIdentity, SignedNote } from '@shared/offline';

import { postJson } from '@/lib/api/client';

import type { RemotePocket } from './ledger';

export function openPocket(amountKobo: number, devicePublicKey: string) {
  return postJson<SignedCertificate>('/api/offline/open', { amountKobo, devicePublicKey });
}

export function pocketStatus() {
  return postJson<{ pocket: RemotePocket | null; serverPublicKey: string }>(
    '/api/offline/status',
    {},
  );
}

export function settleNotes(notes: SignedNote[]) {
  return postJson<{ results: NoteResult[] }>('/api/offline/settle', { notes }, { retry: true });
}

export function releasePocket() {
  return postJson<{ releasedKobo: number }>('/api/offline/release', {});
}

/** Adds to the pocket on this phone (0 just renews it), or opens one. */
export function topUpPocket(addKobo: number, devicePublicKey: string) {
  return postJson<SignedCertificate>('/api/offline/topup', { addKobo, devicePublicKey });
}

/** A Faara-signed card with this person's name, for receiving offline. */
export function fetchIdentity() {
  return postJson<SignedIdentity>('/api/offline/identity', {});
}
