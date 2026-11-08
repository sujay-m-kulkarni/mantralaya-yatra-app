// Shapes stored on the phone and exchanged with the API (docs/architecture/api-contract.md).
// Money is always integer paise. Dates are yyyy-MM-dd; times are ISO 8601 with offset.

export type PaymentMode = 'cash' | 'upi' | 'bank';
export type Role = 'accounts' | 'volunteer' | 'viewer';

export const PAYMENT_MODES: readonly PaymentMode[] = ['cash', 'upi', 'bank'];

export interface Sankalpa {
  onBehalfOf: string | null;
  gotra: string | null;
  nakshatra: string | null;
  rashi: string | null;
  occasion: string | null;
}

export interface SevaType {
  id: string;
  code: string;
  name: string;
  ratePaise: number | null;
  dailyLimit: number | null;
  requiresSankalpa: boolean;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Where an entry stands on this phone.
 * pending: recorded here, not yet accepted by the server (it is in the outbox).
 * synced: accepted by the server, or pulled from another phone.
 * rejected: the server refused it; `error` says why. It stays visible so nothing silently disappears.
 */
export type SyncState = 'pending' | 'synced' | 'rejected';

interface EntryBase {
  id: string;
  recordedAt: string;
  /** The member's user id from the server; null for entries made on this phone and not yet synced. */
  recordedBy: string | null;
  /** The server's sequence number; null until synced. */
  seq: number | null;
  state: SyncState;
  error: string | null;
}

export interface Booking extends EntryBase {
  sevaCode: string;
  sevaDate: string;
  devoteeName: string;
  devoteePhone: string | null;
  sankalpa: Sankalpa | null;
  amountPaise: number;
  draftReceiptNo: string;
  /** The final number from the server, e.g. SRV-0033. */
  receiptNo: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  /** Warnings from the server's answer to this phone's push. */
  warnings: string[];
}

export interface Payment extends EntryBase {
  bookingId: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
}

export interface Reversal extends EntryBase {
  entryId: string;
  entryKind: 'booking' | 'payment';
  reason: string;
}

export interface Member {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  hasSignedIn: boolean;
}

export interface YatraSummary {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  role: Role;
}

// ---- Wire shapes (match the backend's contracts) ----

export interface BookingIn {
  id: string;
  sevaCode: string;
  sevaDate: string;
  devoteeName: string;
  devoteePhone: string | null;
  sankalpa: Sankalpa | null;
  amountPaise: number;
  draftReceiptNo: string;
  recordedAt: string;
}

export interface PaymentIn {
  id: string;
  bookingId: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  recordedAt: string;
}

export interface ReversalIn {
  id: string;
  entryId: string;
  reason: string;
  recordedAt: string;
}

export interface PushRequest {
  deviceId: string;
  bookings: BookingIn[];
  payments: PaymentIn[];
  reversals: ReversalIn[];
}

export type EntryKind = 'booking' | 'payment' | 'reversal' | 'sevaType';
export type EntryStatus = 'applied' | 'duplicate' | 'rejected';

export interface EntryResult {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  seq?: number | null;
  receiptNo?: string | null;
  warnings?: string[] | null;
  error?: string | null;
}

export interface PushResponse {
  results: EntryResult[];
  highestSeq: number;
}

export interface BookingOut {
  id: string;
  sevaCode: string;
  sevaDate: string;
  devoteeName: string;
  devoteePhone: string | null;
  sankalpa: Sankalpa | null;
  amountPaise: number;
  draftReceiptNo: string;
  receiptNo: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface PaymentOut {
  id: string;
  bookingId: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface ReversalOut {
  id: string;
  entryId: string;
  entryKind: 'booking' | 'payment';
  reason: string;
  recordedBy: string;
  recordedAt: string;
}

export interface PulledChange {
  kind: EntryKind;
  seq: number;
  booking?: BookingOut | null;
  payment?: PaymentOut | null;
  reversal?: ReversalOut | null;
  sevaType?: SevaType | null;
}

export interface PullResponse {
  changes: PulledChange[];
  nextAfter: number;
  hasMore: boolean;
}

export const WARNING_TEXT: Record<string, string> = {
  daily_limit_exceeded: 'Over the daily limit — flagged for the accountant',
  amount_differs_from_rate: 'Amount differs from the set rate',
};
