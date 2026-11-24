import { parseFaaraLink, payLink, requestLink } from '../links';

describe('Faara links in QR codes', () => {
  it('reads pay links and request links', () => {
    expect(parseFaaraLink(payLink('mama.tolu'))).toEqual({ kind: 'pay', username: 'mama.tolu' });
    expect(parseFaaraLink('https://faara.mejibuilds.com/pay/@Tolu_A/')).toEqual({
      kind: 'pay',
      username: 'tolu_a',
    });
    expect(parseFaaraLink(requestLink('RQabc123'))).toEqual({ kind: 'request', id: 'RQabc123' });
  });

  it('ignores other sites, other pages and plain text', () => {
    expect(parseFaaraLink('https://evil.example.com/pay/mama.tolu')).toBeNull();
    expect(parseFaaraLink('https://faara.mejibuilds.com.evil.com/pay/mama')).toBeNull();
    expect(parseFaaraLink('https://faara.mejibuilds.com/about')).toBeNull();
    expect(parseFaaraLink('javascript:alert(1)')).toBeNull();
    expect(parseFaaraLink('mama.tolu')).toBeNull();
  });
});
