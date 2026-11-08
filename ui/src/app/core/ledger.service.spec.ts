import { TestBed } from '@angular/core/testing';

import { Fetch } from './api';
import { FETCH, LOCAL_STORE, LedgerService } from './ledger.service';
import { EntryResult, PulledChange, PushRequest, YatraSummary } from './models';
import { BrowserStore, MemoryStorage } from './store/browser-store';
import { sevaTypes } from './testing';

const YATRA: YatraSummary = { id: 'y1', name: 'Mantralaya Yatra 2026', startsOn: '2026-12-01', endsOn: '2026-12-08', role: 'volunteer' };

/**
 * A stand-in for the API's push and pull: it accepts everything, numbers receipts per seva,
 * and hands every accepted entry back on pull, as the real server does.
 */
class FakeServer {
  online = true;
  seq = 0;
  readonly changes: PulledChange[] = [];
  readonly pushes: PushRequest[] = [];
  private readonly receipts = new Map<string, number>();
  private readonly seen = new Map<string, EntryResult>();

  constructor() {
    for (const t of sevaTypes()) this.changes.push({ kind: 'sevaType', seq: ++this.seq, sevaType: t });
  }

  readonly fetch: Fetch = async (url, init) => {
    if (!this.online) throw new TypeError('Failed to fetch');
    if (url.includes('/sync/push')) return json(this.push(JSON.parse(String(init!.body)) as PushRequest));
    const after = Number(new URL(url).searchParams.get('after'));
    const page = this.changes.filter((c) => c.seq > after);
    return json({ changes: page, nextAfter: page.at(-1)?.seq ?? after, hasMore: false });
  };

  private push(request: PushRequest) {
    this.pushes.push(request);
    const results: EntryResult[] = [];
    for (const b of request.bookings) {
      const known = this.seen.get(b.id);
      if (known) { results.push({ ...known, status: 'duplicate' }); continue; }
      const n = (this.receipts.get(b.sevaCode) ?? 0) + 1;
      this.receipts.set(b.sevaCode, n);
      const receiptNo = `${b.sevaCode}-${String(n).padStart(4, '0')}`;
      const seq = ++this.seq;
      this.changes.push({ kind: 'booking', seq, booking: { ...b, receiptNo, needsReview: false, reviewReason: null, recordedBy: 'u1' } });
      const result: EntryResult = { id: b.id, kind: 'booking', status: 'applied', seq, receiptNo };
      this.seen.set(b.id, result);
      results.push(result);
    }
    for (const p of request.payments) {
      const seq = ++this.seq;
      this.changes.push({ kind: 'payment', seq, payment: { ...p, recordedBy: 'u1' } });
      results.push({ id: p.id, kind: 'payment', status: 'applied', seq });
    }
    return { results, highestSeq: this.seq };
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('LedgerService', () => {
  let server: FakeServer;
  let storage: MemoryStorage;
  let ledger: LedgerService;

  async function start(): Promise<LedgerService> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCAL_STORE, useValue: new BrowserStore(storage, 'test') },
        { provide: FETCH, useValue: server.fetch },
      ],
    });
    const service = TestBed.inject(LedgerService);
    await service.init();
    return service;
  }

  beforeEach(async () => {
    server = new FakeServer();
    storage = new MemoryStorage();
    ledger = await start();
    await ledger.saveSettings({ baseUrl: 'http://api.test', displayName: 'Ramesh', devUser: 'ramesh@x.in', devEmail: 'ramesh@x.in' });
    await ledger.selectYatra(YATRA);
    await ledger.sync();
  });

  it('gets the sevas on the first sync', () => {
    expect(ledger.ledger().sevaTypes.map((t) => t.code)).toEqual(['SSA', 'SRV', 'HST', 'AST']);
    expect(ledger.status().phase).toBe('idle');
  });

  it('records offline, keeps entries across a restart, and sends them when back online', async () => {
    server.online = false;
    const booking = await ledger.recordBooking({
      sevaCode: 'SRV', sevaDate: '2026-12-04', devoteeName: ' Venkatesh ', devoteePhone: '', sankalpa: null,
      amountPaise: 100100, payment: { amountPaise: 100100, mode: 'upi', reference: '412345' },
    });
    await ledger.sync();

    expect(booking.draftReceiptNo).toBe('SRV-D-RAM-0001');
    expect(booking.devoteeName).toBe('Venkatesh');
    expect(ledger.pending()).toBe(2);
    expect(ledger.status().phase).toBe('offline');

    // The app is closed and opened again: entries come back from the phone's store.
    ledger = await start();
    expect(ledger.pending()).toBe(2);

    server.online = true;
    await ledger.sync();

    const stored = ledger.ledger().bookings[0];
    expect(stored.receiptNo).toBe('SRV-0001');
    expect(stored.state).toBe('synced');
    expect(ledger.pending()).toBe(0);
    expect(server.pushes.length).toBe(1);
  });

  it('numbers drafts on from where the phone left off', async () => {
    server.online = false;
    const base = { sevaDate: '2026-12-04', devoteeName: 'A', devoteePhone: null, sankalpa: null, amountPaise: 100, payment: null };
    await ledger.recordBooking({ ...base, sevaCode: 'SRV' });
    const second = await ledger.recordBooking({ ...base, sevaCode: 'AST' });
    expect(second.draftReceiptNo).toBe('AST-D-RAM-0002');
  });

  it('a payment later on settles what is due, and overpaying is refused', async () => {
    const booking = await ledger.recordBooking({
      sevaCode: 'SSA', sevaDate: '2026-12-04', devoteeName: 'Raghavendra', devoteePhone: null, sankalpa: null, amountPaise: 500100, payment: null,
    });
    await ledger.recordPayment(booking.id, { amountPaise: 300000, mode: 'cash', reference: null });

    await expectAsync(ledger.recordPayment(booking.id, { amountPaise: 300000, mode: 'cash', reference: null })).toBeRejected();
    await ledger.sync();
    expect(ledger.ledger().payments.length).toBe(1);
    expect(ledger.pending()).toBe(0);
  });

  it("pulls other phones' bookings", async () => {
    server.changes.push({
      kind: 'booking', seq: ++server.seq,
      booking: { id: 'other', sevaCode: 'HST', sevaDate: '2026-12-04', devoteeName: 'Srinivas', devoteePhone: null, sankalpa: null, amountPaise: 250100, draftReceiptNo: 'HST-D-SUM-0001', receiptNo: 'HST-0001', needsReview: false, reviewReason: null, recordedBy: 'u2', recordedAt: '2026-12-01T10:00:00+05:30' },
    });

    await ledger.sync();

    expect(ledger.ledger().bookings.map((b) => b.receiptNo)).toEqual(['HST-0001']);
  });
});
