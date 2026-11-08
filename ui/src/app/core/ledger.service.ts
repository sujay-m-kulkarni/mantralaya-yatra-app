import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiClient, ApiError, Connection } from './api';
import { nowIst } from './dates';
import { newId } from './ids';
import { Ledger, dueOn } from './ledger';
import { Booking, Payment, PaymentMode, Reversal, Sankalpa, SevaType, YatraSummary } from './models';
import { DocWrite, YatraData, emptyData } from './store/local-store';
import { applyPulledChanges, applyPushResults, buildPushes, draftReceiptNo, pendingCount, withWrites } from './sync';

import { FETCH, LOCAL_STORE } from './tokens';
import { API_KEY, DEFAULT_SERVER } from './version';

export { FETCH, LOCAL_STORE } from './tokens';

/** Who is using this phone, and which server it talks to. */
export interface Settings extends Connection {
  /** The volunteer's name, used for draft receipt numbers. */
  displayName: string;
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  message: string | null;
  lastSyncedAt: string | null;
}

export interface NewBooking {
  sevaCode: string;
  sevaDate: string;
  devoteeName: string;
  devoteePhone: string | null;
  sankalpa: Sankalpa | null;
  amountPaise: number;
  /** Money taken now. Null or 0 records the booking as pending. */
  payment: { amountPaise: number; mode: PaymentMode; reference: string | null } | null;
}

const META = {
  settings: 'settings',
  deviceId: 'device_id',
  yatra: 'active_yatra',
  draftCounter: 'draft_counter',
  cursor: (yatraId: string) => `cursor:${yatraId}`,
  lastSynced: (yatraId: string) => `last_synced:${yatraId}`,
};

/**
 * The phone's copy of the active yatra's books. Every entry is written to the local store first, so recording
 * works offline; sync pushes pending entries and pulls what other phones recorded.
 */
@Injectable({ providedIn: 'root' })
export class LedgerService {
  private readonly store = inject(LOCAL_STORE);
  private readonly fetchFn = inject(FETCH);

  readonly settings = signal<Settings | null>(null);
  readonly yatra = signal<YatraSummary | null>(null);
  readonly data = signal<YatraData>(emptyData());
  readonly status = signal<SyncStatus>({ phase: 'idle', message: null, lastSyncedAt: null });

  readonly ledger = computed<Ledger>(() => this.data());
  readonly pending = computed(() => pendingCount(this.data()));
  readonly rejected = computed(() =>
    [...this.data().bookings, ...this.data().payments, ...this.data().reversals].filter((e) => e.state === 'rejected'),
  );
  readonly canRecord = computed(() => this.yatra()?.role === 'volunteer' || this.yatra()?.role === 'accounts');
  readonly isAccounts = computed(() => this.yatra()?.role === 'accounts');

  private deviceId = '';
  private ready: Promise<void> | null = null;
  private running: Promise<void> | null = null;
  private again: Promise<void> | null = null;

  /** Loads settings and the active yatra's rows. Safe to call many times. */
  init(): Promise<void> {
    this.ready ??= this.load();
    return this.ready;
  }

  api(): ApiClient {
    const settings = this.settings();
    if (!settings) throw new ApiError('Set up your name first.', 0);
    // Builds with the API key always talk to their own server (Azure); developer builds use what was entered.
    const connection: Connection = API_KEY ? { baseUrl: DEFAULT_SERVER, apiKey: API_KEY } : settings;
    return new ApiClient(connection, this.fetchFn);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.store.setMeta(META.settings, JSON.stringify(settings));
    this.settings.set(settings);
  }

  /** Makes a yatra the active one and loads what this phone has for it. */
  async selectYatra(yatra: YatraSummary): Promise<void> {
    await this.store.setMeta(META.yatra, JSON.stringify(yatra));
    this.yatra.set(yatra);
    this.data.set(await this.store.load(yatra.id));
    const last = await this.store.getMeta(META.lastSynced(yatra.id));
    this.status.set({ phase: 'idle', message: null, lastSyncedAt: last });
  }

  /** Records a booking, and its payment if money was taken, on this phone. Returns the booking. */
  async recordBooking(input: NewBooking): Promise<Booking> {
    const yatra = this.requireYatra();
    const counter = Number((await this.store.getMeta(META.draftCounter)) ?? '0') + 1;
    const recordedAt = nowIst();
    const booking: Booking = {
      id: newId(),
      sevaCode: input.sevaCode,
      sevaDate: input.sevaDate,
      devoteeName: input.devoteeName.trim(),
      devoteePhone: input.devoteePhone?.trim() || null,
      sankalpa: input.sankalpa,
      amountPaise: input.amountPaise,
      draftReceiptNo: draftReceiptNo(input.sevaCode, this.settings()?.displayName ?? '', counter),
      receiptNo: null,
      needsReview: false,
      reviewReason: null,
      warnings: [],
      recordedAt,
      recordedBy: null,
      seq: null,
      state: 'pending',
      error: null,
    };
    const writes: DocWrite[] = [{ collection: 'bookings', doc: booking }];
    if (input.payment && input.payment.amountPaise > 0) {
      writes.push({ collection: 'payments', doc: this.newPayment(booking.id, input.payment, recordedAt) });
    }
    await this.commit(yatra.id, writes, { [META.draftCounter]: String(counter) });
    void this.sync();
    return booking;
  }

  /** Records money taken later against a booking (a part payment, or a pending one being paid). */
  async recordPayment(bookingId: string, payment: { amountPaise: number; mode: PaymentMode; reference: string | null }): Promise<void> {
    const yatra = this.requireYatra();
    const due = dueOn(this.ledger(), bookingId);
    if (payment.amountPaise <= 0 || payment.amountPaise > due) {
      throw new Error(`The payment must be between ₹0.01 and what is still due.`);
    }
    await this.commit(yatra.id, [{ collection: 'payments', doc: this.newPayment(bookingId, payment, nowIst()) }]);
    void this.sync();
  }

  /** A day another screen wants the register to show next (the day of a seva just saved). */
  readonly focusDay = signal<string | null>(null);

  /**
   * The accountant creates or changes a seva. Sevas live on the server (it numbers receipts by their code),
   * so this needs network; the change then comes back to this phone with a sync.
   */
  async saveSevaType(code: string, seva: Omit<SevaType, 'id' | 'code'>): Promise<SevaType> {
    const yatra = this.requireYatra();
    const saved = await this.api().saveSevaType(yatra.id, code, seva);
    await this.sync();
    return saved;
  }

  /** The accountant cancels a booking or payment. The server refuses reversals from anyone else. */
  async reverse(entryId: string, entryKind: 'booking' | 'payment', reason: string): Promise<void> {
    const yatra = this.requireYatra();
    const reversal: Reversal = {
      id: newId(),
      entryId,
      entryKind,
      reason: reason.trim(),
      recordedAt: nowIst(),
      recordedBy: null,
      seq: null,
      state: 'pending',
      error: null,
    };
    await this.commit(yatra.id, [{ collection: 'reversals', doc: reversal }]);
    void this.sync();
  }

  /**
   * Pushes pending entries, then pulls everything new. One run at a time: a call made while a run is going
   * waits for it and then runs once more, so an entry recorded mid-sync is never left behind.
   */
  sync(): Promise<void> {
    if (this.running) {
      this.again ??= this.running.then(() => {
        this.again = null;
        return this.sync();
      });
      return this.again;
    }
    this.running = this.runSync().finally(() => (this.running = null));
    return this.running;
  }

  private async runSync(): Promise<void> {
    const yatra = this.yatra();
    if (!yatra || !this.settings()) return;
    this.status.update((s) => ({ ...s, phase: 'syncing', message: null }));
    try {
      const api = this.api();
      for (const request of buildPushes(this.data(), this.deviceId)) {
        const response = await api.push(yatra.id, request);
        await this.commit(yatra.id, applyPushResults(this.data(), response.results));
      }

      let after = Number((await this.store.getMeta(META.cursor(yatra.id))) ?? '0');
      for (;;) {
        const page = await api.pull(yatra.id, after);
        await this.commit(yatra.id, applyPulledChanges(this.data(), page.changes), { [META.cursor(yatra.id)]: String(page.nextAfter) });
        after = page.nextAfter;
        if (!page.hasMore) break;
      }

      const at = new Date().toISOString();
      await this.store.setMeta(META.lastSynced(yatra.id), at);
      this.status.set({ phase: 'idle', message: null, lastSyncedAt: at });
    } catch (error) {
      const offline = error instanceof ApiError && error.isOffline;
      this.status.update((s) => ({
        ...s,
        phase: offline ? 'offline' : 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  private newPayment(bookingId: string, p: { amountPaise: number; mode: PaymentMode; reference: string | null }, recordedAt: string): Payment {
    return {
      id: newId(),
      bookingId,
      amountPaise: p.amountPaise,
      mode: p.mode,
      reference: p.mode === 'cash' ? null : p.reference?.trim() || null,
      recordedAt,
      recordedBy: null,
      seq: null,
      state: 'pending',
      error: null,
    };
  }

  /** Writes to the store first, then updates the screen's copy, so what is shown is always saved. */
  private async commit(yatraId: string, writes: DocWrite[], meta?: Record<string, string | null>): Promise<void> {
    if (writes.length === 0 && !meta) return;
    await this.store.write(yatraId, writes, meta);
    if (this.yatra()?.id === yatraId) this.data.update((d) => withWrites(d, writes));
  }

  private requireYatra(): YatraSummary {
    const yatra = this.yatra();
    if (!yatra) throw new Error('No yatra is selected.');
    return yatra;
  }

  private async load(): Promise<void> {
    this.deviceId = (await this.store.getMeta(META.deviceId)) ?? '';
    if (!this.deviceId) {
      this.deviceId = newId();
      await this.store.setMeta(META.deviceId, this.deviceId);
    }
    const settings = await this.store.getMeta(META.settings);
    if (settings) {
      const saved = JSON.parse(settings) as Settings;
      // A build with the API key always talks to its own server (Azure), whatever an older build saved.
      this.settings.set(API_KEY ? { ...saved, baseUrl: DEFAULT_SERVER } : saved);
    }
    const yatra = await this.store.getMeta(META.yatra);
    if (yatra) await this.selectYatra(JSON.parse(yatra) as YatraSummary);
  }
}
