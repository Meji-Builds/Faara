import { parseNewTicket, parseTicketReply, parseTicketStatus } from '..';

describe('support validation', () => {
  it('accepts a ticket with or without a payment', () => {
    expect(
      parseNewTicket({
        category: 'payment',
        message: 'My money did not arrive',
        paymentId: 'pay123',
      }),
    ).toEqual({ category: 'payment', message: 'My money did not arrive', paymentId: 'pay123' });
    expect(parseNewTicket({ category: 'other', message: 'Hello there' }).paymentId).toBeNull();
  });

  it('rejects empty or unknown input', () => {
    expect(() => parseNewTicket({ category: 'nope', message: 'Hello there' })).toThrow();
    expect(() => parseNewTicket({ category: 'other', message: 'hi' })).toThrow();
    expect(() => parseTicketReply({ ticketId: 'x', text: 'Hello there' })).toThrow();
    expect(() => parseTicketStatus({ ticketId: 'TKabcdefgh', status: 'lost' })).toThrow();
  });
});
