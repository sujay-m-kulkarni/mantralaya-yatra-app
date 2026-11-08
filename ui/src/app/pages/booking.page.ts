import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { formatDay } from '../core/dates';
import { InrPipe } from '../core/inr.pipe';
import { positionOf, reversedIds } from '../core/ledger';
import { LedgerService } from '../core/ledger.service';
import { PAYMENT_MODES, PaymentMode, WARNING_TEXT } from '../core/models';
import { paiseToInput, parseRupees } from '../core/money';

/** One booking: its receipt, payments, what is due, sharing the receipt, and the accountant's reversals. */
@Component({
  selector: 'app-booking',
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, InrPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/register" text="" /></ion-buttons>
        <ion-title>Booking</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (view(); as v) {
        <div class="page-body">
          <section class="card receipt">
            <div class="receipt-top">
              <span class="pill seva">{{ v.sevaName }}</span>
              @switch (v.booking.state) {
                @case ('pending') { <span class="pill warn">Not sent yet</span> }
                @case ('rejected') { <span class="pill bad">Refused by server</span> }
                @default { <span class="pill ok">Synced</span> }
              }
            </div>
            <div class="receipt-no num">{{ v.booking.receiptNo ?? v.booking.draftReceiptNo }}</div>
            @if (!v.booking.receiptNo) {
              <div class="muted">Provisional number. The final one comes when this phone syncs.</div>
            } @else if (v.booking.receiptNo !== v.booking.draftReceiptNo) {
              <div class="muted">Printed on the phone as {{ v.booking.draftReceiptNo }}</div>
            }
            <h1>{{ v.booking.devoteeName }}</h1>
            <dl>
              <dt>Seva day</dt><dd>{{ day(v.booking.sevaDate) }}</dd>
              @if (v.booking.devoteePhone) { <dt>Mobile</dt><dd>{{ v.booking.devoteePhone }}</dd> }
              @if (v.booking.sankalpa; as s) {
                @if (s.onBehalfOf) { <dt>On behalf of</dt><dd>{{ s.onBehalfOf }}</dd> }
                @if (s.gotra) { <dt>Gotra</dt><dd>{{ s.gotra }}</dd> }
                @if (s.nakshatra) { <dt>Nakshatra</dt><dd>{{ s.nakshatra }}</dd> }
                @if (s.rashi) { <dt>Rashi</dt><dd>{{ s.rashi }}</dd> }
                @if (s.occasion) { <dt>Occasion</dt><dd>{{ s.occasion }}</dd> }
              }
              <dt>Amount</dt><dd class="num strong">{{ v.booking.amountPaise | inr }}</dd>
              <dt>Received</dt><dd class="num">{{ v.position.paidPaise | inr }}</dd>
              @if (v.position.isReversed) {
                <dt>Refund due</dt><dd class="num bad">{{ v.position.refundDuePaise | inr }}</dd>
              } @else {
                <dt>Still due</dt><dd class="num" [class.bad]="v.position.pendingPaise > 0">{{ v.position.pendingPaise | inr }}</dd>
              }
            </dl>
          </section>

          @if (v.booking.error) { <div class="banner bad" role="alert">{{ v.booking.error }}</div> }
          @if (v.booking.needsReview && v.booking.reviewReason) { <div class="banner warn">{{ v.booking.reviewReason }}</div> }
          @for (w of v.booking.warnings; track w) { <div class="banner warn">{{ warningText(w) }}</div> }
          @if (v.reversal; as r) {
            <div class="banner bad">Reversed: {{ r.reason }}{{ r.state === 'pending' ? ' (not sent yet)' : '' }}</div>
          }

          <section>
            <h2 class="section-label">Payments</h2>
            <div class="payments">
              @for (p of v.payments; track p.payment.id) {
                <div class="card payment" [class.struck]="p.reversed">
                  <div>
                    <div class="num strong">{{ p.payment.amountPaise | inr }}</div>
                    <div class="muted">{{ modeLabel(p.payment.mode) }}{{ p.payment.reference ? ' · ' + p.payment.reference : '' }}</div>
                  </div>
                  <div class="payment-side">
                    @if (p.reversed) { <span class="pill bad">Reversed</span> }
                    @else if (p.payment.state === 'pending') { <span class="pill warn">Not sent</span> }
                    @else if (p.payment.state === 'rejected') { <span class="pill bad">Refused</span> }
                    @if (canReverse(p.payment.state) && !p.reversed && !v.position.isReversed) {
                      <button type="button" class="text-btn" (click)="startReverse(p.payment.id, 'payment')">Reverse</button>
                    }
                  </div>
                  @if (p.payment.error) { <div class="muted bad full">{{ p.payment.error }}</div> }
                </div>
              } @empty {
                <p class="muted">No money received yet.</p>
              }
            </div>
          </section>

          @if (ledger.canRecord() && !v.position.isReversed && v.position.pendingPaise > 0 && v.booking.state !== 'rejected') {
            <form class="card form" (ngSubmit)="pay(v.position.pendingPaise)">
              <h2 class="section-label">Record a payment</h2>
              <div class="segmented" role="group" aria-label="Payment mode">
                @for (m of modes; track m) {
                  <button type="button" [attr.aria-pressed]="mode() === m" (click)="mode.set(m)">{{ modeLabel(m) }}</button>
                }
              </div>
              <div class="grid-2">
                <div class="field">
                  <label for="pay">Amount (₹)</label>
                  <input id="pay" name="pay" class="num" inputmode="decimal" [(ngModel)]="payAmount" [placeholder]="input(v.position.pendingPaise)" />
                </div>
                @if (mode() !== 'cash') {
                  <div class="field">
                    <label for="pref">{{ mode() === 'upi' ? 'UPI ref / UTR' : 'Bank ref' }}</label>
                    <input id="pref" name="pref" [(ngModel)]="payRef" />
                  </div>
                }
              </div>
              <button class="btn secondary" type="submit">Save payment</button>
            </form>
          }

          @if (reversing(); as r) {
            <form class="card form" (ngSubmit)="confirmReverse()">
              <h2 class="section-label">Reverse this {{ r.kind }}</h2>
              <p class="muted">Nothing is deleted: a reversal is recorded with your reason, and the {{ r.kind }} stops counting.</p>
              <div class="field">
                <label for="reason">Reason</label>
                <input id="reason" name="reason" [(ngModel)]="reason" placeholder="e.g. Booked twice by mistake" required />
              </div>
              <div class="grid-2">
                <button class="btn secondary" type="button" (click)="reversing.set(null)">Cancel</button>
                <button class="btn danger" type="submit">Reverse</button>
              </div>
            </form>
          } @else if (canReverse(v.booking.state) && !v.position.isReversed) {
            <button class="btn danger" type="button" (click)="startReverse(v.booking.id, 'booking')">Reverse this booking</button>
          }

          @if (error()) { <div class="banner bad" role="alert">{{ error() }}</div> }
        </div>
      } @else {
        <div class="page-body"><p class="muted">This booking is not on this phone.</p></div>
      }
    </ion-content>
  `,
  styles: `
    .receipt { padding: 16px; display: flex; flex-direction: column; gap: 6px; }
    .receipt-top { display: flex; justify-content: space-between; gap: 8px; }
    .receipt-no { font-size: 22px; font-weight: 700; font-family: 'Space Grotesk', Inter, sans-serif; margin-top: 6px; }
    h1 { margin: 6px 0 0; font-size: 20px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 8px 0 0; font-size: 14px; }
    dt { color: var(--my-muted); }
    dd { margin: 0; text-align: right; }
    .strong { font-weight: 700; }
    .bad { color: var(--my-bad); }
    .muted { color: var(--my-muted); font-size: 13px; margin: 0; }
    .payments { display: flex; flex-direction: column; gap: 8px; }
    .payment { padding: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .payment.struck .strong { text-decoration: line-through; color: var(--my-muted); }
    .payment-side { display: flex; align-items: center; gap: 8px; }
    .full { flex-basis: 100%; }
    .text-btn { background: none; border: none; color: var(--my-bad); font: inherit; font-size: 14px; font-weight: 600; min-height: 44px; padding: 0 8px; cursor: pointer; }
    .form { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .form .section-label { margin: 0; }
  `,
})
export class BookingPage {
  readonly ledger = inject(LedgerService);

  readonly id = input.required<string>();

  readonly modes = PAYMENT_MODES;
  readonly mode = signal<PaymentMode>('cash');
  readonly reversing = signal<{ entryId: string; kind: 'booking' | 'payment' } | null>(null);
  readonly error = signal<string | null>(null);
  payAmount = '';
  payRef = '';
  reason = '';

  readonly view = computed(() => {
    const ledger = this.ledger.ledger();
    const booking = ledger.bookings.find((b) => b.id === this.id());
    if (!booking) return null;
    const reversed = reversedIds(ledger);
    const live = ledger.reversals.filter((r) => r.state !== 'rejected');
    return {
      booking,
      sevaName: ledger.sevaTypes.find((t) => t.code === booking.sevaCode)?.name ?? booking.sevaCode,
      position: positionOf(booking, ledger.payments, reversed),
      reversal: live.find((r) => r.entryId === booking.id) ?? null,
      payments: ledger.payments
        .filter((p) => p.bookingId === booking.id)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        .map((payment) => ({ payment, reversed: reversed.has(payment.id) })),
    };
  });

  day(d: string): string {
    return formatDay(d);
  }

  input(paise: number): string {
    return paiseToInput(paise);
  }

  modeLabel(m: PaymentMode): string {
    return m === 'upi' ? 'UPI' : m === 'cash' ? 'Cash' : 'Bank';
  }

  warningText(code: string): string {
    return WARNING_TEXT[code] ?? code;
  }

  /** Only the accountant reverses, and only entries the server has accepted. */
  canReverse(state: string): boolean {
    return this.ledger.isAccounts() && state === 'synced';
  }

  async pay(duePaise: number): Promise<void> {
    this.error.set(null);
    const amount = this.payAmount.trim() ? parseRupees(this.payAmount) : duePaise;
    if (amount === null || amount > duePaise) {
      this.error.set(`Enter an amount up to ₹${paiseToInput(duePaise)}.`);
      return;
    }
    try {
      await this.ledger.recordPayment(this.id(), { amountPaise: amount, mode: this.mode(), reference: this.payRef });
      this.payAmount = '';
      this.payRef = '';
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  startReverse(entryId: string, kind: 'booking' | 'payment'): void {
    this.reason = '';
    this.reversing.set({ entryId, kind });
  }

  async confirmReverse(): Promise<void> {
    const r = this.reversing();
    if (!r) return;
    if (!this.reason.trim()) {
      this.error.set('Give a reason for the reversal.');
      return;
    }
    this.error.set(null);
    await this.ledger.reverse(r.entryId, r.kind, this.reason);
    this.reversing.set(null);
  }
}
