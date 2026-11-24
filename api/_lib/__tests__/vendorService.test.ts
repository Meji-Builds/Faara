import { isTillCode, parseTillLookup, type VendorApplicationInput } from '../../../shared/vendors';
import { ApiError } from '../errors';
import { MemoryStore } from '../store';
import { VendorService } from '../vendorService';

const application: VendorApplicationInput = {
  businessName: 'Mama Tolu Foods',
  category: 'Food and drinks',
  location: 'Beside the main gate, OOU',
  description: 'Rice, beans and swallow for students.',
  nin: '12345678901',
  cacNumber: '',
  agreedToTerms: true,
};

function setup() {
  const store = new MemoryStore();
  const notes: string[] = [];
  const vendors = new VendorService({
    store,
    now: () => 5_000,
    reviewers: ['nifemi'],
    notify: async (uid, message) => void notes.push(`${uid}: ${message.title}`),
  });
  store.docs.set('users/boss', { fullName: 'Nifemi', username: 'nifemi', phone: '+2348000000001' });
  store.docs.set('users/tolu', {
    fullName: 'Tolu Adebayo',
    username: 'tolu.a',
    phone: '+2348000000002',
  });
  store.docs.set('users/kola', {
    fullName: 'Kola Musa',
    username: 'kolamusa',
    phone: '+2348000000003',
  });
  return { store, vendors, notes };
}

async function expectApiError(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('vendor applications', () => {
  it('applies, waits for review, and never keeps the full NIN', async () => {
    const { vendors, store } = setup();
    const status = await vendors.apply('tolu', application);
    expect(status.application).toMatchObject({ status: 'pending', ninLast4: '8901' });
    expect(status.vendor).toBeNull();
    expect(JSON.stringify([...store.docs.values()])).not.toContain('12345678901');
    await expectApiError(vendors.apply('tolu', application), 'failed-precondition');
  });

  it('only reviewers can see and decide applications', async () => {
    const { vendors } = setup();
    await vendors.apply('tolu', application);
    await expectApiError(vendors.pending('kola'), 'permission-denied');
    await expectApiError(
      vendors.review('kola', { uid: 'tolu', approve: true, reason: '' }),
      'permission-denied',
    );
    const waiting = await vendors.pending('boss');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ uid: 'tolu', applicant: { username: 'tolu.a' } });
    expect(JSON.stringify(waiting)).not.toContain('ninHash');
    expect((await vendors.status('boss')).isReviewer).toBe(true);
  });

  it('approving makes them a vendor and tells them', async () => {
    const { vendors, notes } = setup();
    await vendors.apply('tolu', application);
    await vendors.review('boss', { uid: 'tolu', approve: true, reason: '' });
    const status = await vendors.status('tolu');
    expect(status.vendor).toMatchObject({ businessName: 'Mama Tolu Foods' });
    expect(status.application?.status).toBe('approved');
    expect(notes).toEqual(['tolu: Mama Tolu Foods is now a Faara vendor']);
    expect(await vendors.pending('boss')).toEqual([]);
    await expectApiError(vendors.apply('tolu', application), 'failed-precondition');
  });

  it('a rejected applicant sees why and can apply again', async () => {
    const { vendors } = setup();
    await vendors.apply('tolu', application);
    await vendors.review('boss', { uid: 'tolu', approve: false, reason: 'Location is unclear.' });
    expect((await vendors.status('tolu')).application).toMatchObject({
      status: 'rejected',
      reason: 'Location is unclear.',
    });
    expect((await vendors.apply('tolu', application)).application?.status).toBe('pending');
  });

  it('one NIN can’t open two vendor accounts', async () => {
    const { vendors } = setup();
    await vendors.apply('tolu', application);
    await expectApiError(vendors.apply('kola', application), 'failed-precondition');
  });

  it('has no reviewers unless they are configured', async () => {
    const store = new MemoryStore();
    store.docs.set('users/boss', { fullName: 'N', username: 'nifemi' });
    const vendors = new VendorService({ store, now: () => 1, reviewers: [] });
    expect((await vendors.status('boss')).isReviewer).toBe(false);
  });
});

describe('vendor tills', () => {
  async function approved() {
    const s = setup();
    await s.vendors.apply('tolu', application);
    await s.vendors.review('boss', { uid: 'tolu', approve: true, reason: '' });
    return s;
  }

  it('gives an approved vendor one lasting till code that customers can look up', async () => {
    const { vendors } = await approved();
    const till = await vendors.till('tolu');
    expect(till).toMatchObject({ username: 'tolu.a', businessName: 'Mama Tolu Foods' });
    expect(isTillCode(till.code)).toBe(true);
    // The same code every time, so a printed sticker keeps working.
    expect((await vendors.till('tolu')).code).toBe(till.code);
    expect(await vendors.shop(till.code)).toEqual({
      code: till.code,
      username: 'tolu.a',
      businessName: 'Mama Tolu Foods',
      category: 'Food and drinks',
      location: 'Beside the main gate, OOU',
    });
  });

  it('has no till for people who aren’t vendors, and unknown codes find nothing', async () => {
    const { vendors } = await approved();
    await expectApiError(vendors.till('kola'), 'permission-denied');
    await expectApiError(vendors.shop('V123456789'), 'not-found');
  });

  it('only accepts well-formed till codes', () => {
    expect(parseTillLookup({ code: 'v12345678z' }).code).toBe('V12345678Z');
    expect(() => parseTillLookup({ code: 'A123456789' })).toThrow();
    expect(() => parseTillLookup({ code: 'V12345' })).toThrow();
    expect(isTillCode('VABCDEFGHU')).toBe(false); // U isn't in the alphabet
  });
});
