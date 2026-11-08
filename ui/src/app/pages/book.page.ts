import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { clampDay, dayNumber, formatDay, istDay } from '../core/dates';
import { InrPipe } from '../core/inr.pipe';
import { activeCount, isFull, sortedSevaTypes } from '../core/ledger';
import { LedgerService } from '../core/ledger.service';
import { PAYMENT_MODES, PaymentMode, Sankalpa, SevaType } from '../core/models';
import { paiseToInput, parseRupees } from '../core/money';
import { receiptText, shareReceipt } from '../core/receipt';

/** Book a seva for a devotee and record the money taken. Saved on the phone at once; sent when there is network. */
@Component({
  selector: 'app-book',
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonFooter, InrPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/register" text="" /></ion-buttons>
        <ion-title>
          Book a seva
          <div class="sub">For {{ dayLabel() }}{{ dayNo() ? ' · Day ' + dayNo() : '' }}</div>
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <form id="book" class="page-body" (ngSubmit)="save()">
        <fieldset>
          <legend class="section-label">1 · Seva</legend>
          <div class="sevas">
            @for (s of sevas(); track s.type.code) {
              <button type="button" class="seva" [class.on]="s.type.code === sevaCode()" [disabled]="s.full" [attr.aria-pressed]="s.type.code === sevaCode()" (click)="pick(s.type)">
                <span class="seva-name">{{ s.type.name }}</span>
                <span class="num">{{ s.type.ratePaise === null ? 'Any amount' : (s.type.ratePaise | inr) }}</span>
                <span class="note" [class.full]="s.full">{{ s.full ? 'Full · ' + s.count + ' of ' + s.type.dailyLimit : s.count + ' booked' }}</span>
              </button>
            }
          </div>
          @if (sevas().length === 0) {
            <div class="banner info">No sevas yet. Sync once with network to get the yatra's sevas.</div>
          }
          <div class="field">
            <label for="date">Seva date</label>
            <input id="date" name="date" type="date" [(ngModel)]="sevaDate" (ngModelChange)="day.set($event)" [min]="yatra().startsOn" [max]="yatra().endsOn" required />
          </div>
        </fieldset>

        <fieldset>
          <legend class="section-label">2 · Devotee</legend>
          <div class="field">
            <label for="devotee">Name</label>
            <input id="devotee" name="devotee" [(ngModel)]="devoteeName" autocomplete="off" required />
          </div>
          <div class="field">
            <label for="phone">Mobile (for the WhatsApp receipt)</label>
            <input id="phone" name="phone" type="tel" inputmode="tel" [(ngModel)]="devoteePhone" placeholder="98450 12345" />
          </div>
        </fieldset>

        <fieldset>
          <legend class="section-label">3 · Sankalpa{{ selected()?.requiresSankalpa ? '' : ' (optional)' }}</legend>
          <div class="field">
            <label for="behalf">On behalf of</label>
            <input id="behalf" name="behalf" [(ngModel)]="onBehalfOf" [placeholder]="devoteeName ? devoteeName + ' & family' : ''" />
          </div>
          <div class="grid-2">
            <div class="field"><label for="gotra">Gotra</label><input id="gotra" name="gotra" [(ngModel)]="gotra" /></div>
            <div class="field"><label for="nak">Nakshatra</label><input id="nak" name="nak" [(ngModel)]="nakshatra" /></div>
            <div class="field"><label for="rashi">Rashi</label><input id="rashi" name="rashi" [(ngModel)]="rashi" /></div>
            <div class="field"><label for="occasion">Occasion</label><input id="occasion" name="occasion" [(ngModel)]="occasion" placeholder="e.g. birthday" /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend class="section-label">4 · Payment</legend>
          <div class="field">
            <label for="amount">Seva amount (₹)</label>
            <input id="amount" name="amount" class="amount num" inputmode="decimal" [(ngModel)]="amount" (ngModelChange)="onAmount($event)" required />
            @if (rateNote()) { <span class="hint">{{ rateNote() }}</span> }
          </div>
          <div class="segmented four" role="group" aria-label="Payment">
            @for (m of modes; track m) {
              <button type="button" [attr.aria-pressed]="mode() === m" (click)="mode.set(m)">{{ modeLabel(m) }}</button>
            }
            <button type="button" [attr.aria-pressed]="mode() === null" (click)="mode.set(null)">Not paid</button>
          </div>
          @if (mode(); as m) {
            <div class="grid-2">
              <div class="field">
                <label for="paid">Received now (₹)</label>
                <input id="paid" name="paid" class="num" inputmode="decimal" [(ngModel)]="paid" />
              </div>
              @if (m !== 'cash') {
                <div class="field">
                  <label for="ref">{{ m === 'upi' ? 'UPI ref / UTR' : 'Bank ref' }}</label>
                  <input id="ref" name="ref" [(ngModel)]="reference" placeholder="Last 6 digits are enough" />
                </div>
              }
            </div>
          }
        </fieldset>

        @if (error()) {
          <div class="banner bad" role="alert">{{ error() }}</div>
        }
      </form>
    </ion-content>

    <ion-footer>
      <div class="footer">
        <div class="footer-line">
          <span class="muted">Collected by <strong>{{ ledger.settings()?.displayName }}</strong></span>
          <span class="muted">{{ selected()?.name ?? 'Pick a seva' }} · <strong class="num">{{ amountPaise() ?? 0 | inr }}</strong></span>
        </div>
        <button class="btn" type="submit" form="book" [disabled]="saving()">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {{ saving() ? 'Saving…' : 'Save & send receipt' }}
        </button>
      </div>
    </ion-footer>
  `,
  styles: `
    .sub { font-size: 12px; font-weight: 400; color: var(--my-muted); font-family: Inter, sans-serif; }
    fieldset { border: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    legend { padding: 0; }
    .sevas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .seva { min-height: 92px; padding: 12px; border-radius: 12px; text-align: left; display: flex; flex-direction: column; gap: 4px; font: inherit; background: #fff; border: 1px solid var(--my-border); color: var(--my-text); cursor: pointer; }
    .seva.on { background: var(--my-accent-soft); border: 2px solid var(--my-accent); }
    .seva:disabled { background: var(--my-soft); border-style: dashed; color: #78716c; cursor: not-allowed; }
    .seva-name { font-size: 14px; font-weight: 700; }
    .note { font-size: 11px; font-weight: 600; color: var(--my-muted); }
    .note.full { color: var(--my-bad); }
    .amount { font-size: 22px !important; font-weight: 700; min-height: 52px !important; }
    .segmented.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .footer { padding: 12px 16px calc(16px + var(--ion-safe-area-bottom, 0px)); background: #fff; border-top: 1px solid var(--my-line); display: flex; flex-direction: column; gap: 8px; max-width: 640px; margin: 0 auto; }
    .footer-line { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
    .muted { color: var(--my-muted); }
    .muted strong { color: var(--my-text); }
  `,
})
export class BookPage implements OnInit {
  readonly ledger = inject(LedgerService);
  private readonly router = inject(Router);

  /** From the register's "Book seva" button: the day being viewed. */
  readonly date = input<string>();

  readonly modes = PAYMENT_MODES;
  readonly yatra = computed(() => this.ledger.yatra()!);

  sevaDate = '';
  devoteeName = '';
  devoteePhone = '';
  onBehalfOf = '';
  gotra = '';
  nakshatra = '';
  rashi = '';
  occasion = '';
  amount = '';
  paid = '';
  reference = '';

  readonly sevaCode = signal<string | null>(null);
  readonly mode = signal<PaymentMode | null>('cash');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly day = signal('');

  readonly sevas = computed(() =>
    sortedSevaTypes(this.ledger.ledger().sevaTypes)
      .filter((t) => t.isActive)
      .map((type) => {
        const count = activeCount(this.ledger.ledger(), type.code, this.day());
        return { type, count, full: isFull(type, count) };
      }),
  );
  readonly selected = computed(() => this.ledger.ledger().sevaTypes.find((t) => t.code === this.sevaCode()) ?? null);
  readonly dayLabel = computed(() => (this.day() ? formatDay(this.day()) : ''));
  readonly dayNo = computed(() => (this.day() ? dayNumber(this.day(), this.yatra().startsOn, this.yatra().endsOn) : null));
  readonly amountPaise = signal<number | null>(null);
  readonly rateNote = computed(() => {
    const rate = this.selected()?.ratePaise ?? null;
    const amount = this.amountPaise();
    return rate !== null && amount !== null && amount !== rate ? `The set rate is ₹${paiseToInput(rate)}; a different amount is allowed.` : null;
  });

  ngOnInit(): void {
    this.sevaDate = clampDay(this.date() ?? istDay(new Date()), this.yatra().startsOn, this.yatra().endsOn);
    this.day.set(this.sevaDate);
    const first = this.sevas().find((s) => !s.full);
    if (first) this.pick(first.type);
  }

  pick(type: SevaType): void {
    this.sevaCode.set(type.code);
    this.amount = paiseToInput(type.ratePaise);
    this.paid = this.amount;
    this.amountPaise.set(type.ratePaise);
  }

  onAmount(text: string): void {
    this.paid = text;
    this.amountPaise.set(parseRupees(text));
  }

  modeLabel(m: PaymentMode): string {
    return m === 'upi' ? 'UPI' : m === 'cash' ? 'Cash' : 'Bank';
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.day.set(this.sevaDate);
    const type = this.selected();
    const amountPaise = parseRupees(this.amount);
    this.amountPaise.set(amountPaise);
    const sankalpa = this.sankalpa();
    const mode = this.mode();
    const paidPaise = mode ? parseRupees(this.paid) : null;

    const problem =
      !type ? 'Pick a seva.'
      : !this.sevaDate || this.sevaDate < this.yatra().startsOn || this.sevaDate > this.yatra().endsOn ? 'Pick a date within the yatra.'
      : !this.devoteeName.trim() ? "Enter the devotee's name."
      : amountPaise === null ? 'Enter the seva amount in rupees, e.g. 1001.'
      : type.requiresSankalpa && !sankalpa ? `${type.name} needs sankalpa details for the priest (at least one field).`
      : mode && paidPaise === null ? 'Enter the amount received, or choose "Not paid".'
      : mode && paidPaise !== null && paidPaise > amountPaise ? 'The amount received is more than the seva amount.'
      : null;
    if (problem || !type || amountPaise === null) {
      this.error.set(problem);
      return;
    }

    this.saving.set(true);
    try {
      const booking = await this.ledger.recordBooking({
        sevaCode: type.code,
        sevaDate: this.sevaDate,
        devoteeName: this.devoteeName,
        devoteePhone: this.devoteePhone,
        sankalpa,
        amountPaise,
        payment: mode && paidPaise ? { amountPaise: paidPaise, mode, reference: this.reference } : null,
      });
      const payments = this.ledger.ledger().payments.filter((p) => p.bookingId === booking.id);
      const paid = payments.reduce((s, p) => s + p.amountPaise, 0);
      await this.router.navigate(['/booking', booking.id], { replaceUrl: true });
      await shareReceipt(receiptText(this.yatra().name, type.name, booking, payments, amountPaise - paid), booking.devoteePhone).catch(() => undefined);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.saving.set(false);
    }
  }

  private sankalpa(): Sankalpa | null {
    const clean = (v: string) => v.trim() || null;
    const s: Sankalpa = {
      onBehalfOf: clean(this.onBehalfOf),
      gotra: clean(this.gotra),
      nakshatra: clean(this.nakshatra),
      rashi: clean(this.rashi),
      occasion: clean(this.occasion),
    };
    return Object.values(s).some((v) => v !== null) ? s : null;
  }
}
