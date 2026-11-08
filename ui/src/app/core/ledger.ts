// The phone's copy of the server's ledger maths (Domain/Ledger/BookingPosition.cs and
// Application/Register/GetDailyRegister.cs), so the register shows the same figures offline.
// Entries the server rejected count for nothing; entries still pending count, since the money is in hand.

import { istDay } from './dates';
import { Booking, Payment, PaymentMode, Reversal, Sankalpa, SevaType } from './models';

export interface Ledger {
  sevaTypes: SevaType[];
  bookings: Booking[];
  payments: Payment[];
  reversals: Reversal[];
}

export interface BookingPosition {
  booking: Booking;
  isReversed: boolean;
  activePayments: Payment[];
  paidPaise: number;
  pendingPaise: number;
  refundDuePaise: number;
}

const live = <T extends { state: string }>(entries: T[]) => entries.filter((e) => e.state !== 'rejected');

export function reversedIds(ledger: Pick<Ledger, 'reversals'>): Set<string> {
  return new Set(live(ledger.reversals).map((r) => r.entryId));
}

export function positionOf(booking: Booking, payments: Payment[], reversed: Set<string>): BookingPosition {
  const activePayments = live(payments).filter((p) => p.bookingId === booking.id && !reversed.has(p.id));
  const paidPaise = activePayments.reduce((sum, p) => sum + p.amountPaise, 0);
  const isReversed = reversed.has(booking.id);
  return {
    booking,
    isReversed,
    activePayments,
    paidPaise,
    pendingPaise: isReversed ? 0 : Math.max(0, booking.amountPaise - paidPaise),
    refundDuePaise: isReversed ? paidPaise : 0,
  };
}

/** Still due on a booking; what the payment form offers by default. */
export function dueOn(ledger: Ledger, bookingId: string): number {
  const booking = ledger.bookings.find((b) => b.id === bookingId);
  if (!booking || booking.state === 'rejected') return 0;
  return positionOf(booking, ledger.payments, reversedIds(ledger)).pendingPaise;
}

/** Bookings for a seva on a day that are not reversed or rejected; used for the daily limit. */
export function activeCount(ledger: Ledger, sevaCode: string, sevaDate: string): number {
  const reversed = reversedIds(ledger);
  return live(ledger.bookings).filter((b) => b.sevaCode === sevaCode && b.sevaDate === sevaDate && !reversed.has(b.id))
    .length;
}

export function isFull(sevaType: SevaType, count: number): boolean {
  return sevaType.dailyLimit !== null && count >= sevaType.dailyLimit;
}

export function sortedSevaTypes(sevaTypes: SevaType[]): SevaType[] {
  return [...sevaTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export interface RegisterTotals {
  cashPaise: number;
  upiPaise: number;
  bankPaise: number;
  collectedPaise: number;
  pendingPaise: number;
  refundDuePaise: number;
  bookingCount: number;
}

export interface SevaDaySummary {
  code: string;
  name: string;
  count: number;
  amountPaise: number;
  dailyLimit: number | null;
  isFull: boolean;
}

export interface RegisterLine {
  booking: Booking;
  sevaName: string;
  /** Final number once synced, otherwise the draft. */
  receiptNo: string;
  paidPaise: number;
  pendingPaise: number;
  modes: PaymentMode[];
  isReversed: boolean;
  refundDuePaise: number;
}

export interface DayRegister {
  totals: RegisterTotals;
  sevas: SevaDaySummary[];
  lines: RegisterLine[];
}

/**
 * One day's register. Lines and seva counts are the sevas performed that day; the cash, UPI and bank
 * totals are money recorded that day in IST, which includes advances for later sevas.
 */
export function dayRegister(ledger: Ledger, day: string): DayRegister {
  const types = sortedSevaTypes(ledger.sevaTypes);
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const order = new Map(types.map((t, i) => [t.code, i]));
  const reversed = reversedIds(ledger);

  const positions = live(ledger.bookings)
    .filter((b) => b.sevaDate === day)
    .map((b) => positionOf(b, ledger.payments, reversed))
    .sort(
      (a, b) =>
        (order.get(a.booking.sevaCode) ?? 99) - (order.get(b.booking.sevaCode) ?? 99) ||
        (a.booking.seq ?? Number.MAX_SAFE_INTEGER) - (b.booking.seq ?? Number.MAX_SAFE_INTEGER) ||
        a.booking.recordedAt.localeCompare(b.booking.recordedAt),
    );

  const lines: RegisterLine[] = positions.map((p) => ({
    booking: p.booking,
    sevaName: typeByCode.get(p.booking.sevaCode)?.name ?? p.booking.sevaCode,
    receiptNo: p.booking.receiptNo ?? p.booking.draftReceiptNo,
    paidPaise: p.paidPaise,
    pendingPaise: p.pendingPaise,
    modes: [...new Set(p.activePayments.map((x) => x.mode))],
    isReversed: p.isReversed,
    refundDuePaise: p.refundDuePaise,
  }));

  const active = positions.filter((p) => !p.isReversed);
  const sevas: SevaDaySummary[] = types
    .map((t) => {
      const mine = active.filter((p) => p.booking.sevaCode === t.code);
      return {
        type: t,
        summary: {
          code: t.code,
          name: t.name,
          count: mine.length,
          amountPaise: mine.reduce((s, p) => s + p.booking.amountPaise, 0),
          dailyLimit: t.dailyLimit,
          isFull: isFull(t, mine.length),
        },
      };
    })
    .filter((x) => x.type.isActive || x.summary.count > 0)
    .map((x) => x.summary);

  const collected = live(ledger.payments).filter((p) => istDay(p.recordedAt) === day && !reversed.has(p.id));
  const sumOf = (mode: PaymentMode) => collected.filter((p) => p.mode === mode).reduce((s, p) => s + p.amountPaise, 0);

  return {
    totals: {
      cashPaise: sumOf('cash'),
      upiPaise: sumOf('upi'),
      bankPaise: sumOf('bank'),
      collectedPaise: collected.reduce((s, p) => s + p.amountPaise, 0),
      pendingPaise: positions.reduce((s, p) => s + p.pendingPaise, 0),
      refundDuePaise: positions.reduce((s, p) => s + p.refundDuePaise, 0),
      bookingCount: active.length,
    },
    sevas,
    lines,
  };
}

export interface PriestListSeva {
  code: string;
  name: string;
  entries: { receiptNo: string; devoteeName: string; sankalpa: Sankalpa | null }[];
}

/** The day's sevas grouped by type with sankalpa details. Reversed bookings are left out; unpaid ones stay. */
export function priestList(ledger: Ledger, day: string): PriestListSeva[] {
  const register = dayRegister(ledger, day);
  return sortedSevaTypes(ledger.sevaTypes)
    .map((t) => ({
      code: t.code,
      name: t.name,
      entries: register.lines
        .filter((l) => l.booking.sevaCode === t.code && !l.isReversed)
        .map((l) => ({ receiptNo: l.receiptNo, devoteeName: l.booking.devoteeName, sankalpa: l.booking.sankalpa })),
    }))
    .filter((g) => g.entries.length > 0);
}

/** Plain text to share or print. */
export function priestListText(yatraName: string, dayLabel: string, groups: PriestListSeva[]): string {
  const lines = [`${yatraName}`, `Seva list — ${dayLabel}`, ''];
  for (const g of groups) {
    lines.push(`*${g.name}* (${g.entries.length})`);
    g.entries.forEach((e, i) => {
      const s = e.sankalpa;
      const details = [s?.onBehalfOf, s?.gotra && `${s.gotra} gotra`, s?.nakshatra && `${s.nakshatra} nakshatra`, s?.rashi && `${s.rashi} rashi`, s?.occasion]
        .filter(Boolean)
        .join(', ');
      lines.push(`${i + 1}. ${e.devoteeName}${details ? ` — ${details}` : ''}  [${e.receiptNo}]`);
    });
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
