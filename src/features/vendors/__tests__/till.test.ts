import type { ShopInfo } from '@shared/vendors';

import { announcement, OUTSIDE_WALLET } from '../announce';
import { rankShops } from '../useNearbyShops';

jest.mock('expo-speech', () => ({ speak: jest.fn() }));
jest.mock('@/features/ble', () => ({}));
jest.mock('@/features/sound', () => ({}));
jest.mock('../vendorsApi', () => ({}));

const shop = (code: string, businessName: string): ShopInfo => ({
  code,
  username: businessName.toLowerCase().replace(/\s+/g, ''),
  businessName,
  category: 'Food and drinks',
  location: 'OOU',
});

describe('till alerts', () => {
  it('reads payments out in English or Pidgin with the first name', () => {
    expect(announcement(500_000, 'Ada Okafor', 'english')).toBe('5,000 naira from Ada');
    expect(announcement(150_050, 'Tunde', 'pidgin')).toBe('Tunde don pay you 1,501 naira');
    expect(announcement(20_000, '  ', 'english')).toBe('200 naira from a customer');
    expect(announcement(250, 'Ada', 'english', 'USDC')).toBe('2.50 US dollars from Ada');
    expect(announcement(500, OUTSIDE_WALLET, 'pidgin', 'USDC')).toBe(
      'a Solana wallet don pay you 5 US dollars',
    );
  });
});

describe('nearby shops', () => {
  const shops = new Map<string, ShopInfo | null>([
    ['V000000001', shop('V000000001', 'Mama Tolu Foods')],
    ['V000000002', shop('V000000002', 'Kola Prints')],
    ['V000000003', null], // heard, but not a verified shop
  ]);

  it('lists verified shops closest first and drops ones gone quiet', () => {
    const now = 100_000;
    const ranked = rankShops(
      new Map([
        ['V000000001', { distanceCm: 300, seenAt: now - 1_000 }],
        ['V000000002', { distanceCm: 40, seenAt: now - 2_000 }],
        ['V000000003', { distanceCm: 10, seenAt: now }],
        ['V000000004', { distanceCm: 10, seenAt: now }], // not looked up yet
      ]),
      shops,
      now,
    );
    expect(ranked.map((s) => s.businessName)).toEqual(['Kola Prints', 'Mama Tolu Foods']);
    const later = rankShops(
      new Map([['V000000001', { distanceCm: 300, seenAt: now - 60_000 }]]),
      shops,
      now,
    );
    expect(later).toEqual([]);
  });
});
