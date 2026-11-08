import { ApiClient, ApiError } from './api';
import { receiptText, whatsAppNumber } from './receipt';
import { booking, payment } from './testing';

describe('receipt', () => {
  it('reads as a receipt, provisional until synced', () => {
    const b = booking({ sankalpa: { onBehalfOf: 'Venkatesh & family', gotra: 'Vasishta', nakshatra: 'Ashwini', rashi: 'Mesha', occasion: null } });
    const text = receiptText('Mantralaya Yatra 2026', 'Sarva Seva', b, [payment(b.id, { amountPaise: 50000, mode: 'upi' })], 50100);

    expect(text).toContain('Seva receipt *SRV-D-RAM-0001* (provisional)');
    expect(text).toContain('Sankalpa: Vasishta gotra, Ashwini nakshatra, Mesha rashi');
    expect(text).toContain('Received: ₹500 (UPI)');
    expect(text).toContain('Balance due: ₹501');
    expect(receiptText('Y', 'S', { ...b, receiptNo: 'SRV-0033' }, [], 0)).not.toContain('provisional');
  });

  it('turns an Indian mobile into a WhatsApp number', () => {
    expect(whatsAppNumber('98450 12345')).toBe('919845012345');
    expect(whatsAppNumber('+91 98450-12345')).toBe('919845012345');
    expect(whatsAppNumber('09845012345')).toBe('919845012345');
    expect(whatsAppNumber('2345 6789')).toBeNull();
    expect(whatsAppNumber('0802345678')).toBeNull();
    expect(whatsAppNumber(null)).toBeNull();
  });
});

describe('ApiClient', () => {
  it('signs in with the dev header and reads problem details on failure', async () => {
    let seen: RequestInit | undefined;
    let url = '';
    const api = new ApiClient({ baseUrl: 'http://api.test/', devUser: 'ramesh', devEmail: 'r@x.in' }, async (u, init) => {
      url = u;
      seen = init;
      return new Response(JSON.stringify({ title: 'Only the accountant can add members.', code: 'forbidden' }), { status: 403 });
    });

    const error = await api.listYatras().then(() => null, (e: unknown) => e as ApiError);

    expect(url).toBe('http://api.test/api/v1/yatras');
    expect((seen!.headers as Record<string, string>)['X-Dev-User']).toBe('ramesh');
    expect(error!.status).toBe(403);
    expect(error!.code).toBe('forbidden');
    expect(error!.message).toBe('Only the accountant can add members.');
  });

  it('reports no network as offline, so entries stay queued', async () => {
    const api = new ApiClient({ baseUrl: 'http://api.test', apiKey: 't'.repeat(40) }, async () => {
      throw new TypeError('Failed to fetch');
    });

    const error = await api.pull('y', 0).then(() => null, (e: unknown) => e as ApiError);

    expect(error!.isOffline).toBeTrue();
  });
});
