// The phone's half of docs/architecture/ledger-and-sync-design.md, as pure functions over the stored rows.
// SyncService runs them against the API and the local store.

import { Booking, EntryResult, Payment, PulledChange, PushRequest, Reversal } from './models';
import { DocWrite, YatraData } from './store/local-store';

/** The server's limit for one push. */
export const MAX_PUSH_ENTRIES = 300;

/**
 * The entries recorded on this phone and not yet accepted, as push requests of at most MAX_PUSH_ENTRIES.
 * All pending bookings are queued before any payment, and payments before reversals, so when the queue is cut
 * into batches a payment always travels in the same push as its booking or a later one, never an earlier one.
 */
export function buildPushes(data: YatraData, deviceId: string): PushRequest[] {
  const pending = <T extends { state: string; recordedAt: string }>(rows: T[]) =>
    rows.filter((r) => r.state === 'pending').sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const queue: (
    | { kind: 'booking'; row: Booking }
    | { kind: 'payment'; row: Payment }
    | { kind: 'reversal'; row: Reversal }
  )[] = [
    ...pending(data.bookings).map((row) => ({ kind: 'booking' as const, row })),
    ...pending(data.payments).map((row) => ({ kind: 'payment' as const, row })),
    ...pending(data.reversals).map((row) => ({ kind: 'reversal' as const, row })),
  ];

  const pushes: PushRequest[] = [];
  for (let i = 0; i < queue.length; i += MAX_PUSH_ENTRIES) {
    const request: PushRequest = { deviceId, bookings: [], payments: [], reversals: [] };
    for (const item of queue.slice(i, i + MAX_PUSH_ENTRIES)) {
      if (item.kind === 'booking') {
        const b = item.row;
        request.bookings.push({
          id: b.id,
          sevaCode: b.sevaCode,
          sevaDate: b.sevaDate,
          devoteeName: b.devoteeName,
          devoteePhone: b.devoteePhone,
          sankalpa: b.sankalpa,
          amountPaise: b.amountPaise,
          draftReceiptNo: b.draftReceiptNo,
          recordedAt: b.recordedAt,
        });
      } else if (item.kind === 'payment') {
        const p = item.row;
        request.payments.push({ id: p.id, bookingId: p.bookingId, amountPaise: p.amountPaise, mode: p.mode, reference: p.reference, recordedAt: p.recordedAt });
      } else {
        const r = item.row;
        request.reversals.push({ id: r.id, entryId: r.entryId, reason: r.reason, recordedAt: r.recordedAt });
      }
    }
    pushes.push(request);
  }
  return pushes;
}

/**
 * What to store after the server answered a push. Accepted (applied or duplicate) entries become synced
 * and bookings take their final receipt number; rejected ones keep their data, marked with the reason.
 */
export function applyPushResults(data: YatraData, results: EntryResult[]): DocWrite[] {
  const writes: DocWrite[] = [];
  for (const result of results) {
    const accepted = result.status === 'applied' || result.status === 'duplicate';
    const settle = <T extends { state: string; seq: number | null; error: string | null }>(row: T): T => ({
      ...row,
      state: accepted ? 'synced' : 'rejected',
      seq: accepted ? (result.seq ?? row.seq) : row.seq,
      error: accepted ? null : (result.error ?? 'Rejected by the server.'),
    });

    if (result.kind === 'booking') {
      const row = data.bookings.find((b) => b.id === result.id);
      if (row) {
        writes.push({
          collection: 'bookings',
          doc: {
            ...settle(row),
            receiptNo: accepted ? (result.receiptNo ?? row.receiptNo) : row.receiptNo,
            warnings: result.warnings ?? row.warnings,
            needsReview: row.needsReview || (result.warnings ?? []).includes('daily_limit_exceeded'),
          },
        });
      }
    } else if (result.kind === 'payment') {
      const row = data.payments.find((p) => p.id === result.id);
      if (row) writes.push({ collection: 'payments', doc: settle(row) });
    } else if (result.kind === 'reversal') {
      const row = data.reversals.find((r) => r.id === result.id);
      if (row) writes.push({ collection: 'reversals', doc: settle(row) });
    }
  }
  return writes;
}

/** What to store from a pulled page: the server's copy always wins, since accepted entries never change. */
export function applyPulledChanges(data: YatraData, changes: PulledChange[]): DocWrite[] {
  const writes: DocWrite[] = [];
  for (const change of changes) {
    if (change.kind === 'sevaType' && change.sevaType) {
      writes.push({ collection: 'sevaTypes', doc: change.sevaType });
    } else if (change.kind === 'booking' && change.booking) {
      const b = change.booking;
      const local = data.bookings.find((x) => x.id === b.id);
      writes.push({
        collection: 'bookings',
        doc: { ...b, seq: change.seq, state: 'synced', error: null, warnings: local?.warnings ?? [] },
      });
    } else if (change.kind === 'payment' && change.payment) {
      writes.push({ collection: 'payments', doc: { ...change.payment, seq: change.seq, state: 'synced', error: null } });
    } else if (change.kind === 'reversal' && change.reversal) {
      writes.push({ collection: 'reversals', doc: { ...change.reversal, seq: change.seq, state: 'synced', error: null } });
    }
  }
  return writes;
}

/** Applies writes to the in-memory copy, the same way the store does. */
export function withWrites(data: YatraData, writes: DocWrite[]): YatraData {
  const next: YatraData = {
    sevaTypes: [...data.sevaTypes],
    bookings: [...data.bookings],
    payments: [...data.payments],
    reversals: [...data.reversals],
  };
  for (const { collection, doc } of writes) {
    const list = next[collection] as { id: string }[];
    const at = list.findIndex((d) => d.id === doc.id);
    if (at >= 0) list[at] = doc;
    else list.push(doc);
  }
  return next;
}

export function pendingCount(data: YatraData): number {
  return [...data.bookings, ...data.payments, ...data.reversals].filter((e) => e.state === 'pending').length;
}

/**
 * The receipt number the phone prints before the server issues the final one, e.g. SRV-D-RAM-0007.
 * The tag comes from the volunteer's name, so the accountant can tell whose phone it came from.
 */
export function draftReceiptNo(sevaCode: string, volunteer: string, counter: number): string {
  const tag = (volunteer.normalize('NFKD').replace(/[^A-Za-z]/g, '').slice(0, 3) || 'PHN').toUpperCase();
  return `${sevaCode}-D-${tag}-${String(counter).padStart(4, '0')}`;
}
