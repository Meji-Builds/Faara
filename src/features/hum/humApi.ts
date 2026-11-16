import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import type {
  ChooseRecipientResponse,
  ClaimChannel,
  ClaimHumResponse,
  CreateHumResponse,
  HumCurrency,
  HumStatus,
  ShapeTriple,
} from '@shared/hum';

import { postJson } from '@/lib/api/client';
import { db } from '@/lib/firebase';

export function createHum(amount: number, currency: HumCurrency, note: string) {
  return postJson<CreateHumResponse>('/api/hums/create', { amount, currency, note });
}

export function claimHum(token: string, channel: ClaimChannel, distanceCm?: number) {
  return postJson<ClaimHumResponse>('/api/hums/claim', { token, channel, distanceCm });
}

export function chooseRecipient(paymentId: string, claimId: string) {
  return postJson<ChooseRecipientResponse>('/api/hums/choose', { paymentId, claimId });
}

export function cancelHum(paymentId: string) {
  return postJson<{ ok: true }>('/api/hums/cancel', { paymentId });
}

/** A claim as the app sees it. */
export interface HumClaim {
  id: string;
  fullName: string;
  username: string;
  distanceCm: number | null;
  status: 'pending' | 'chosen' | 'not-chosen';
  shapes: ShapeTriple | null;
  createdAt: number;
}

export interface HumState {
  status: HumStatus;
  chosenClaimId: string | null;
  claimCount: number;
}

/** Closest first; claims without a distance estimate go last, in arrival order. */
function byDistance(a: HumClaim, b: HumClaim): number {
  if (a.distanceCm === null && b.distanceCm === null) return a.createdAt - b.createdAt;
  if (a.distanceCm === null) return 1;
  if (b.distanceCm === null) return -1;
  return a.distanceCm - b.distanceCm;
}

function toClaim(id: string, data: Record<string, unknown>): HumClaim {
  return {
    id,
    fullName: String(data.fullName ?? ''),
    username: String(data.username ?? ''),
    distanceCm: typeof data.distanceCm === 'number' ? data.distanceCm : null,
    status: (data.status as HumClaim['status']) ?? 'pending',
    shapes: (data.shapes as ShapeTriple | null) ?? null,
    createdAt: Number(data.createdAt ?? 0),
  };
}

/** Sender: live list of everyone who claimed the hum, closest first. */
export function watchClaims(
  paymentId: string,
  onChange: (claims: HumClaim[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'hums', paymentId, 'claims'), (snapshot) => {
    onChange(snapshot.docs.map((d) => toClaim(d.id, d.data())).sort(byDistance));
  });
}

/** Receiver: their own claim (status and shapes once chosen). */
export function watchClaim(
  paymentId: string,
  claimId: string,
  onChange: (claim: HumClaim | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'hums', paymentId, 'claims', claimId), (snapshot) => {
    onChange(snapshot.exists() ? toClaim(snapshot.id, snapshot.data()) : null);
  });
}

/** Sender or claimant: hum status (open, chosen, cancelled). */
export function watchHum(paymentId: string, onChange: (hum: HumState | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'hums', paymentId), (snapshot) => {
    if (!snapshot.exists()) return onChange(null);
    const data = snapshot.data();
    onChange({
      status: data.status as HumStatus,
      chosenClaimId: (data.chosenClaimId as string | null) ?? null,
      claimCount: Number(data.claimCount ?? 0),
    });
  });
}
