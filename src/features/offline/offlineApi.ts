import type { NoteResult, SignedCertificate, SignedIdentity, SignedNote } from '@shared/offline';

import { postJson } from '@/lib/api/client';

import type { RemotePocket } from './ledger';

export function openPocket(amountKobo: number, devicePublicKey: string) {
  return postJson<SignedCertificate>('/api/offline/open', { amountKobo, devicePublicKey });
}

export function pocketStatus() {
  return postJson<{
    pocket: RemotePocket | null;
    serverPublicKey: string;
    /** How much the person chose to keep ready offline (null if never chosen). */
    reserveKobo?: number | null;
  }>('/api/offline/status', {});
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

/** Gets back the open pocket's certificate on the phone that holds its key (after a reinstall). */
export function reclaimPocket(devicePublicKey: string) {
  return postJson<{ certificate: SignedCertificate; remainingKobo: number }>(
    '/api/offline/reclaim',
    { devicePublicKey },
  );
}

/** Saves how much to keep ready offline on the person's account. */
export function saveReserve(reserveKobo: number) {
  return postJson<{ ok: true }>('/api/offline/reserve', { reserveKobo });
}

/** Moves the open pocket to this phone, when the phone it was on lost its key. */
export function movePocket(devicePublicKey: string) {
  return postJson<{ certificate: SignedCertificate; remainingKobo: number }>('/api/offline/move', {
    devicePublicKey,
  });
}
