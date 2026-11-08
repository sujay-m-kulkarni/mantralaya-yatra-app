import { activeCount, dayRegister, dueOn, priestList, priestListText } from './ledger';
import { DAY1, DAY4, MORNING, booking, data, payment, reversal } from './testing';

describe('dayRegister', () => {
  it('shows paid, pending and counts for the seva day, in seva order', () => {
    const paid = booking({ sevaCode: 'SRV' });
    const unpaid = booking({ sevaCode: 'SSA', amountPaise: 500100, devoteeName: 'Raghavendra Rao' });
    const ledger = data({ bookings: [paid, unpaid], payments: [payment(paid.id, { mode: 'upi' })] });

    const r = dayRegister(ledger, DAY4);

    expect(r.lines.map((l) => l.booking.sevaCode)).toEqual(['SSA', 'SRV']);
    expect(r.totals.bookingCount).toBe(2);
    expect(r.totals.pendingPaise).toBe(500100);
    expect(r.lines[1].modes).toEqual(['upi']);
    expect(r.sevas.length).toBe(4);
  });

  it('counts money on the day it was taken, not the seva day', () => {
    const advance = booking({ sevaDate: DAY4 });
    const ledger = data({ bookings: [advance], payments: [payment(advance.id, { recordedAt: MORNING, mode: 'cash' })] });

    expect(dayRegister(ledger, DAY1).totals.cashPaise).toBe(100100);
    expect(dayRegister(ledger, DAY1).lines.length).toBe(0);
    expect(dayRegister(ledger, DAY4).totals.collectedPaise).toBe(0);
  });

  it('shows a reversed booking with its refund due and frees its slot', () => {
    const b = booking({ sevaCode: 'HST', amountPaise: 250100 });
    const ledger = data({ bookings: [b], payments: [payment(b.id, { amountPaise: 40000 })], reversals: [reversal(b.id)] });

    const r = dayRegister(ledger, DAY4);

    expect(r.lines[0].isReversed).toBeTrue();
    expect(r.totals.refundDuePaise).toBe(40000);
    expect(r.totals.pendingPaise).toBe(0);
    expect(r.sevas.find((s) => s.code === 'HST')!.isFull).toBeFalse();
    expect(activeCount(ledger, 'HST', DAY4)).toBe(0);
  });

  it('marks a seva full at its daily limit', () => {
    const ledger = data({ bookings: [booking({ sevaCode: 'HST' })] });
    expect(dayRegister(ledger, DAY4).sevas.find((s) => s.code === 'HST')!.isFull).toBeTrue();
  });

  it('counts pending entries (money in hand) but not ones the server refused', () => {
    const pending = booking({ state: 'pending' });
    const refused = booking({ state: 'rejected', error: 'Unknown seva' });
    const ledger = data({
      bookings: [pending, refused],
      payments: [payment(pending.id, { state: 'pending' }), payment(refused.id, { state: 'rejected' })],
    });

    const r = dayRegister(ledger, DAY4);

    expect(r.lines.map((l) => l.booking.id)).toEqual([pending.id]);
    expect(dayRegister(ledger, DAY1).totals.cashPaise).toBe(100100);
  });

  it('a reversed payment leaves the totals and the booking is due again', () => {
    const b = booking();
    const p = payment(b.id);
    const ledger = data({ bookings: [b], payments: [p], reversals: [reversal(p.id, { entryKind: 'payment' })] });

    expect(dayRegister(ledger, DAY1).totals.cashPaise).toBe(0);
    expect(dueOn(ledger, b.id)).toBe(100100);
  });

  it('uses the final receipt number once there is one', () => {
    const ledger = data({ bookings: [booking({ receiptNo: 'SRV-0033' }), booking({ draftReceiptNo: 'SRV-D-RAM-0009' })] });
    expect(dayRegister(ledger, DAY4).lines.map((l) => l.receiptNo).sort()).toEqual(['SRV-0033', 'SRV-D-RAM-0009']);
  });
});

describe('priestList', () => {
  it('groups by seva, leaves out reversed bookings, and reads well as text', () => {
    const keep = booking({ sevaCode: 'AST', devoteeName: 'Gopal Hegde', receiptNo: 'AST-0001', sankalpa: { onBehalfOf: null, gotra: 'Gautama', nakshatra: 'Revati', rashi: null, occasion: 'Birthday' } });
    const drop = booking({ sevaCode: 'AST', devoteeName: 'Duplicate' });
    const first = booking({ sevaCode: 'SSA', devoteeName: 'Raghavendra Rao', sankalpa: null, receiptNo: 'SSA-0001' });
    const ledger = data({ bookings: [keep, drop, first], reversals: [reversal(drop.id)] });

    const groups = priestList(ledger, DAY4);
    const text = priestListText('Mantralaya Yatra 2026', 'Fri, 4 Dec 2026', groups);

    expect(groups.map((g) => g.code)).toEqual(['SSA', 'AST']);
    expect(groups[1].entries.map((e) => e.devoteeName)).toEqual(['Gopal Hegde']);
    expect(text).toContain('*Ashtottara* (1)');
    expect(text).toContain('1. Gopal Hegde — Gautama gotra, Revati nakshatra, Birthday  [AST-0001]');
    expect(text).not.toContain('Duplicate');
  });
});
