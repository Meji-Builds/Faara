import {
  createRecoveryPhrase,
  deriveEd25519,
  fromHex,
  isValidRecoveryPhrase,
  keypairFromSeed,
  solanaSeedFromPhrase,
  toHex,
} from '../keys';

describe('SLIP-0010 ed25519 derivation', () => {
  // Official SLIP-0010 test vector 1 for ed25519.
  const seed = fromHex('000102030405060708090a0b0c0d0e0f');

  it.each([
    ['m', '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7'],
    ["m/0'", '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3'],
    ["m/0'/1'", 'b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2'],
    ["m/0'/1'/2'", '92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9'],
  ])('matches the spec at %s', (path, privateKey) => {
    expect(toHex(deriveEd25519(seed, path))).toBe(privateKey);
  });

  it('rejects non-hardened paths', () => {
    expect(() => deriveEd25519(seed, 'm/0')).toThrow();
  });
});

describe('recovery phrase', () => {
  it('creates valid 12-word phrases that derive stable Solana keys', () => {
    const phrase = createRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
    const a = keypairFromSeed(solanaSeedFromPhrase(phrase)).publicKey.toBase58();
    const b = keypairFromSeed(
      solanaSeedFromPhrase(`  ${phrase.toUpperCase()}  `),
    ).publicKey.toBase58();
    expect(a).toBe(b);
    expect(a).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('rejects invalid phrases', () => {
    expect(isValidRecoveryPhrase('abandon abandon abandon')).toBe(false);
    expect(() => solanaSeedFromPhrase('not a real phrase at all')).toThrow();
  });
});
