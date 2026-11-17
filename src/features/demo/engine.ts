/**
 * Scripted stand-in for Faara's backend, used only to film the product with made-up people.
 * Enabled with EXPO_PUBLIC_DEMO=1; never part of a shipped build.
 */
import type {
  ActivityEntry,
  ChooseRecipientResponse,
  ClaimChannel,
  ClaimHumResponse,
  CreateHumResponse,
  CreateTransferResponse,
  LookupUserResponse,
  SafetyResult,
  SettleHumResponse,
  ShapeTriple,
} from '@shared/hum';

import type { HumClaim, HumState } from '@/features/hum/humApi';

export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

export interface Persona {
  uid: string;
  fullName: string;
  username: string;
  phone: string;
  balanceNaira: number;
}

export const PEOPLE: Record<string, Persona> = {
  ada: {
    uid: 'ada',
    fullName: 'Ada Okafor',
    username: 'ada.ok',
    phone: '+2348031234567',
    balanceNaira: 48_500,
  },
  tolu: {
    uid: 'tolu',
    fullName: 'Tolu Adebayo',
    username: 'tolu.a',
    phone: '+2348057654321',
    balanceNaira: 12_300,
  },
  chidi: {
    uid: 'chidi',
    fullName: 'Chidi Eze',
    username: 'chidi.eze',
    phone: '+2348093456789',
    balanceNaira: 30_000,
  },
};

function personaKey(): string {
  if (typeof window === 'undefined') return 'ada';
  return new URLSearchParams(window.location.search).get('as') ?? 'ada';
}
export const me: Persona = PEOPLE[personaKey()] ?? (PEOPLE.ada as Persona);

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
function subscribe(fn: Listener) {
  listeners.add(fn);
  fn();
  return () => void listeners.delete(fn);
}
const later = (ms: number, fn: () => void) => setTimeout(() => (fn(), notify()), ms);

const SHAPES: ShapeTriple = ['triangle', 'ring', 'diamond'];
const safe: SafetyResult = {
  level: 'low',
  headline: 'Checked · Low risk',
  detail: 'Account 2 years old · Paid 4× before',
  checkedAt: Date.now(),
  walletChecked: false,
};

interface State {
  balanceKobo: number;
  activity: ActivityEntry[];
  hum: {
    paymentId: string;
    state: HumState;
    claims: HumClaim[];
    amountKobo: number;
    note: string;
  } | null;
  myClaim: HumClaim | null;
  incoming: { amountKobo: number; note: string; from: Persona } | null;
}

const ago = (hours: number) => Date.now() - hours * 3_600_000;
const entry = (
  id: string,
  direction: 'in' | 'out',
  kind: ActivityEntry['kind'],
  who: Persona | null,
  naira: number,
  note: string,
  hours: number,
  channel: ActivityEntry['channel'] = 'sound',
): ActivityEntry => ({
  paymentId: id,
  direction,
  kind,
  counterpartyName: who?.fullName ?? 'Card or bank transfer',
  counterpartyUsername: who?.username ?? '',
  amountMinor: naira * 100,
  currency: 'NGN',
  note,
  createdAt: ago(hours),
  signature: null,
  channel,
});

const state: State = {
  balanceKobo: me.balanceNaira * 100,
  activity:
    me.uid === 'ada'
      ? [
          entry('h1', 'out', 'hum', PEOPLE.chidi as Persona, 3_500, 'Suya and drinks', 20),
          entry(
            'h2',
            'in',
            'transfer',
            PEOPLE.tolu as Persona,
            12_000,
            'Rent share',
            52,
            'username',
          ),
          entry('h3', 'in', 'deposit', null, 20_000, '', 120, 'username'),
          entry('h4', 'out', 'hum', PEOPLE.tolu as Persona, 1_800, 'Lunch', 150),
        ]
      : [
          entry('h1', 'in', 'hum', PEOPLE.ada as Persona, 2_000, 'Cinema', 30),
          entry(
            'h2',
            'out',
            'transfer',
            PEOPLE.chidi as Persona,
            6_500,
            'Data and airtime',
            80,
            'username',
          ),
        ],
  hum: null,
  myClaim: null,
  incoming: null,
};

const fund = { amount: 5_000 };

const claim = (p: Persona, id: string, cm: number, channel: ClaimChannel): HumClaim => ({
  id,
  fullName: p.fullName,
  username: p.username,
  distanceCm: cm,
  channel,
  status: 'pending',
  shapes: null,
  createdAt: Date.now(),
  safety: safe,
});

export const demoApi = {
  // ---- sender
  createHum(amount: number, _currency: string, note: string): CreateHumResponse {
    const paymentId = `demo${Date.now()}`;
    state.hum = {
      paymentId,
      amountKobo: Math.round(amount * 100),
      note,
      state: { status: 'open', chosenClaimId: null, claimCount: 0 },
      claims: [],
    };
    later(4200, () => {
      if (!state.hum) return;
      state.hum.claims.push(claim(PEOPLE.tolu as Persona, 'c-tolu', 24, 'sound'));
      state.hum.state.claimCount = state.hum.claims.length;
    });
    later(5600, () => {
      if (!state.hum) return;
      state.hum.claims.push(claim(PEOPLE.chidi as Persona, 'c-chidi', 138, 'bluetooth'));
      state.hum.state.claimCount = state.hum.claims.length;
    });
    return { paymentId, token: 'K7Q2M9X4TB', manualCode: '482913', expiresAt: Date.now() + 30_000 };
  },
  chooseRecipient(_paymentId: string, claimId: string): ChooseRecipientResponse {
    const hum = state.hum;
    if (hum) {
      hum.state = { ...hum.state, status: 'chosen', chosenClaimId: claimId };
      hum.claims = hum.claims.map((c) =>
        c.id === claimId
          ? { ...c, status: 'chosen', shapes: SHAPES }
          : { ...c, status: 'not-chosen' },
      );
      notify();
    }
    const who = claimId === 'c-chidi' ? PEOPLE.chidi : PEOPLE.tolu;
    return {
      shapes: SHAPES,
      recipient: { fullName: who!.fullName, username: who!.username, walletAddress: null },
    };
  },
  settleHum(paymentId: string): SettleHumResponse {
    const hum = state.hum;
    if (hum) {
      state.balanceKobo -= hum.amountKobo;
      const who = hum.state.chosenClaimId === 'c-chidi' ? PEOPLE.chidi : PEOPLE.tolu;
      state.activity.unshift({
        ...entry(paymentId, 'out', 'hum', who as Persona, hum.amountKobo / 100, hum.note, 0),
        createdAt: Date.now(),
      });
      notify();
    }
    return { settledAt: Date.now(), signature: null };
  },
  cancelHum() {
    state.hum = null;
    notify();
  },
  // ---- receiver
  claimHum(): ClaimHumResponse {
    const from = PEOPLE.ada as Persona;
    state.incoming = { amountKobo: 500_000, note: 'Suya and drinks', from };
    state.myClaim = { ...claim(me, 'me', 22, 'sound'), safety: null };
    state.hum = {
      paymentId: 'demo-in',
      amountKobo: 500_000,
      note: 'Suya and drinks',
      claims: [],
      state: { status: 'open', chosenClaimId: null, claimCount: 1 },
    };
    later(3200, () => {
      state.myClaim = { ...(state.myClaim as HumClaim), status: 'chosen', shapes: SHAPES };
      if (state.hum)
        state.hum.state = { ...state.hum.state, status: 'chosen', chosenClaimId: 'me' };
    });
    later(8200, () => {
      state.myClaim = { ...(state.myClaim as HumClaim), status: 'settled' };
      state.balanceKobo += 500_000;
      state.activity.unshift({
        ...entry('demo-in', 'in', 'hum', from, 5_000, 'Suya and drinks', 0),
        createdAt: Date.now(),
      });
    });
    return {
      paymentId: 'demo-in',
      claimId: 'me',
      sender: { fullName: from.fullName, username: from.username },
      amount: 5_000,
      currency: 'NGN',
      note: 'Suya and drinks',
    };
  },
  // ---- send
  lookup(query: { username: string } | { phone: string }): LookupUserResponse {
    const hit = Object.values(PEOPLE).find((p) =>
      'username' in query ? p.username === query.username : p.phone === query.phone,
    );
    if (!hit || hit.uid === me.uid)
      throw Object.assign(new Error('Nobody on Faara has that.'), { code: 'not-found' });
    return { fullName: hit.fullName, username: hit.username, hasWallet: false };
  },
  createTransfer(
    username: string,
    amount: number,
    _c: string,
    note: string,
  ): CreateTransferResponse {
    const who = Object.values(PEOPLE).find((p) => p.username === username) as Persona;
    state.hum = {
      paymentId: `tr${Date.now()}`,
      amountKobo: amount * 100,
      note,
      claims: [],
      state: { status: 'chosen', chosenClaimId: 'c-tolu', claimCount: 1 },
    };
    state.hum.state.chosenClaimId = 'c-tolu';
    state.myClaim = { ...claim(who, 'c-tolu', 0, 'sound'), status: 'chosen' };
    notify();
    return {
      paymentId: state.hum.paymentId,
      claimId: 'c-tolu',
      recipient: { fullName: who.fullName, username: who.username, walletAddress: null },
    };
  },
  // ---- funding
  initializeFunding() {
    return { reference: 'FNDdemo00000001', checkoutUrl: 'about:blank' };
  },
  verifyFunding() {
    const amountNaira = fund.amount;
    state.balanceKobo += amountNaira * 100;
    state.activity.unshift({
      ...entry('dep1', 'in', 'deposit', null, amountNaira, '', 0),
      createdAt: Date.now(),
    });
    notify();
    return { status: 'success' as const, amount: amountNaira };
  },
  // ---- watchers
  watchBalance: (cb: (kobo: number) => void) => subscribe(() => cb(state.balanceKobo)),
  watchActivity: (max: number, cb: (e: ActivityEntry[]) => void) =>
    subscribe(() =>
      cb([...state.activity].sort((a, b) => b.createdAt - a.createdAt).slice(0, max)),
    ),
  watchEntry: (id: string, cb: (e: ActivityEntry | null) => void) =>
    subscribe(() => cb(state.activity.find((a) => a.paymentId === id) ?? null)),
  watchClaims: (cb: (c: HumClaim[]) => void) => subscribe(() => cb([...(state.hum?.claims ?? [])])),
  watchMyClaim: (cb: (c: HumClaim | null) => void) => subscribe(() => cb(state.myClaim)),
  watchHum: (cb: (h: HumState | null) => void) =>
    subscribe(() => cb(state.hum ? { ...state.hum.state } : null)),
  setPendingFunding(amount: number) {
    fund.amount = amount;
  },
};
