import { BookingOut, PulledChange } from './models';
import { MAX_PUSH_ENTRIES, applyPulledChanges, applyPushResults, buildPushes, draftReceiptNo, pendingCount, withWrites } from './sync';
import { booking, data, payment, reversal } from './testing';

describe('buildPushes', () => {
  it('sends only pending entries, bookings before payments before reversals', () => {
    const b = booking({ state: 'pending' });
    const ledger = data({
      bookings: [booking(), b],
      payments: [payment(b.id, { state: 'pending' })],
      reversals: [reversal('x', { state: 'pending' })],
    });

    const [push, ...more] = buildPushes(ledger, 'device-1');

    expect(more.length).toBe(0);
    expect(push.deviceId).toBe('device-1');
    expect(push.bookings.map((x) => x.id)).toEqual([b.id]);
    expect(push.payments.length).toBe(1);
    expect(push.reversals.length).toBe(1);
    expect(Object.keys(push.bookings[0])).not.toContain('state');
  });

  it('splits a big queue so no payment travels before its booking', () => {
    const bookings = Array.from({ length: MAX_PUSH_ENTRIES }, () => booking({ state: 'pending' }));
    const late = payment(bookings[0].id, { state: 'pending' });

    const pushes = buildPushes(data({ bookings, payments: [late] }), 'd');

    expect(pushes.length).toBe(2);
    expect(pushes[0].bookings.length).toBe(MAX_PUSH_ENTRIES);
    expect(pushes[1].payments.map((p) => p.id)).toEqual([late.id]);
  });

  it('sends nothing when nothing is pending', () => {
    expect(buildPushes(data({ bookings: [booking()] }), 'd')).toEqual([]);
  });
});

describe('applyPushResults', () => {
  it('marks accepted entries synced and gives bookings their final receipt', () => {
    const b = booking({ state: 'pending' });
    const p = payment(b.id, { state: 'pending' });
    const ledger = data({ bookings: [b], payments: [p] });

    const next = withWrites(
      ledger,
      applyPushResults(ledger, [
        { id: b.id, kind: 'booking', status: 'applied', seq: 41, receiptNo: 'SRV-0033', warnings: ['daily_limit_exceeded'] },
        { id: p.id, kind: 'payment', status: 'duplicate', seq: 42 },
      ]),
    );

    expect(next.bookings[0]).toEqual(jasmine.objectContaining({ state: 'synced', seq: 41, receiptNo: 'SRV-0033', needsReview: true }));
    expect(next.bookings[0].warnings).toEqual(['daily_limit_exceeded']);
    expect(next.payments[0]).toEqual(jasmine.objectContaining({ state: 'synced', seq: 42 }));
    expect(pendingCount(next)).toBe(0);
  });

  it('keeps a refused entry, with the reason, so nothing disappears silently', () => {
    const b = booking({ state: 'pending' });
    const ledger = data({ bookings: [b] });

    const next = withWrites(ledger, applyPushResults(ledger, [{ id: b.id, kind: 'booking', status: 'rejected', error: 'Unknown seva code "XYZ".' }]));

    expect(next.bookings[0]).toEqual(jasmine.objectContaining({ state: 'rejected', error: 'Unknown seva code "XYZ".', devoteeName: b.devoteeName }));
  });
});

describe('applyPulledChanges', () => {
  it("stores other phones' entries and seva changes as synced", () => {
    const out: BookingOut = {
      id: 'b-other', sevaCode: 'SRV', sevaDate: '2026-12-04', devoteeName: 'Padma Joshi', devoteePhone: null, sankalpa: null,
      amountPaise: 100100, draftReceiptNo: 'SRV-D-SUM-0001', receiptNo: 'SRV-0034', needsReview: false, reviewReason: null,
      recordedBy: 'user-2', recordedAt: '2026-12-01T10:00:00+05:30',
    };
    const ledger = data();
    const rate = { ...ledger.sevaTypes[1], ratePaise: 110100 };
    const changes: PulledChange[] = [
      { kind: 'sevaType', seq: 50, sevaType: rate },
      { kind: 'booking', seq: 51, booking: out },
    ];

    const next = withWrites(ledger, applyPulledChanges(ledger, changes));

    expect(next.sevaTypes.find((t) => t.code === 'SRV')!.ratePaise).toBe(110100);
    expect(next.sevaTypes.length).toBe(4);
    expect(next.bookings[0]).toEqual(jasmine.objectContaining({ id: 'b-other', state: 'synced', seq: 51, warnings: [] }));
  });

  it("replaces this phone's own copy with the server's, keeping the warnings it was shown", () => {
    const mine = booking({ state: 'synced', warnings: ['amount_differs_from_rate'] });
    const ledger = data({ bookings: [mine] });
    const { state: _s, seq: _q, error: _e, warnings: _w, ...rest } = mine;
    const out: BookingOut = { ...rest, receiptNo: 'SRV-0001', recordedBy: 'me' };

    const next = withWrites(ledger, applyPulledChanges(ledger, [{ kind: 'booking', seq: 9, booking: out }]));

    expect(next.bookings.length).toBe(1);
    expect(next.bookings[0].warnings).toEqual(['amount_differs_from_rate']);
    expect(next.bookings[0].recordedBy).toBe('me');
  });
});

describe('draftReceiptNo', () => {
  it("tags drafts with the volunteer's name", () => {
    expect(draftReceiptNo('SRV', 'Ramesh', 7)).toBe('SRV-D-RAM-0007');
    expect(draftReceiptNo('HST', 'Sū', 12)).toBe('HST-D-SU-0012');
    expect(draftReceiptNo('AST', '', 1)).toBe('AST-D-PHN-0001');
  });
});
