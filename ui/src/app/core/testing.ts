// Builders shared by the specs.

import { Booking, Payment, Reversal, SevaType } from './models';
import { YatraData } from './store/local-store';

export const DAY1 = '2026-12-01';
export const DAY4 = '2026-12-04';
/** 9 am IST on day 1. */
export const MORNING = '2026-12-01T09:00:00.000+05:30';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export function sevaTypes(): SevaType[] {
  return [
    { id: id(), code: 'SSA', name: 'Sarva Samarpana Seva', ratePaise: 500100, dailyLimit: null, requiresSankalpa: true, isActive: true, sortOrder: 1 },
    { id: id(), code: 'SRV', name: 'Sarva Seva', ratePaise: 100100, dailyLimit: null, requiresSankalpa: true, isActive: true, sortOrder: 2 },
    { id: id(), code: 'HST', name: 'Hastodaka', ratePaise: 250100, dailyLimit: 1, requiresSankalpa: true, isActive: true, sortOrder: 3 },
    { id: id(), code: 'AST', name: 'Ashtottara', ratePaise: 25100, dailyLimit: null, requiresSankalpa: false, isActive: true, sortOrder: 4 },
  ];
}

export function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: id(),
    sevaCode: 'SRV',
    sevaDate: DAY4,
    devoteeName: 'Venkatesh Kulkarni',
    devoteePhone: null,
    sankalpa: { onBehalfOf: null, gotra: 'Vasishta', nakshatra: 'Ashwini', rashi: null, occasion: null },
    amountPaise: 100100,
    draftReceiptNo: 'SRV-D-RAM-0001',
    receiptNo: null,
    needsReview: false,
    reviewReason: null,
    warnings: [],
    recordedAt: MORNING,
    recordedBy: null,
    seq: null,
    state: 'synced',
    error: null,
    ...over,
  };
}

export function payment(bookingId: string, over: Partial<Payment> = {}): Payment {
  return {
    id: id(),
    bookingId,
    amountPaise: 100100,
    mode: 'cash',
    reference: null,
    recordedAt: MORNING,
    recordedBy: null,
    seq: null,
    state: 'synced',
    error: null,
    ...over,
  };
}

export function reversal(entryId: string, over: Partial<Reversal> = {}): Reversal {
  return {
    id: id(),
    entryId,
    entryKind: 'booking',
    reason: 'Booked twice',
    recordedAt: MORNING,
    recordedBy: null,
    seq: null,
    state: 'synced',
    error: null,
    ...over,
  };
}

export function data(over: Partial<YatraData> = {}): YatraData {
  return { sevaTypes: sevaTypes(), bookings: [], payments: [], reversals: [], ...over };
}
