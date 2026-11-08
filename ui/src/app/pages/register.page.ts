import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonToolbar, RefresherCustomEvent } from '@ionic/angular';

import { addDays, clampDay, dayNumber, formatDay, istDay } from '../core/dates';
import { InrPipe } from '../core/inr.pipe';
import { dayRegister } from '../core/ledger';
import { LedgerService } from '../core/ledger.service';
import { SyncChipComponent } from '../core/sync-chip.component';

/** The day's sevas: money collected, slots used, and every booking. Works offline from the phone's copy. */
@Component({
  selector: 'app-register',
  imports: [IonHeader, IonToolbar, IonContent, IonRefresher, IonRefresherContent, RouterLink, InrPipe, SyncChipComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <div class="top">
          <div class="title-row">
            <div>
              <h1>Seva Register</h1>
              <a class="yatra-link" routerLink="/setup">{{ ledger.yatra()?.name }}</a>
            </div>
            <app-sync-chip />
          </div>
          <div class="day-switch">
            <button type="button" aria-label="Previous day" (click)="move(-1)" [disabled]="atStart()">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div class="day-label">
              <div class="day">{{ dayLabel() }}</div>
              <div class="muted">{{ dayNo() ? 'Day ' + dayNo() + ' of yatra' : 'Outside the yatra dates' }}</div>
            </div>
            <button type="button" aria-label="Next day" (click)="move(1)" [disabled]="atEnd()">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="page-body">
        @if (ledger.rejected().length > 0) {
          <div class="banner bad" role="alert">
            {{ ledger.rejected().length }} {{ ledger.rejected().length === 1 ? 'entry was' : 'entries were' }} refused by the server.
            Open the booking to see why.
          </div>
        }
        @if (ledger.status().phase === 'error' && ledger.status().message) {
          <div class="banner warn">{{ ledger.status().message }}</div>
        }

        @if (ledger.ledger().sevaTypes.length === 0) {
          <div class="banner info">
            No sevas yet. @if (ledger.isAccounts()) { <a routerLink="/sevas">Create the sevas and their prices</a> before booking. } @else { The accountant creates them. }
          </div>
        }

        <section class="summary" aria-label="Collected today">
          <div class="summary-top">
            <div>
              <div class="eyebrow">Collected on this day</div>
              <div class="big num">{{ register().totals.collectedPaise | inr }}</div>
            </div>
            <span class="count">{{ register().totals.bookingCount }} sevas</span>
          </div>
          <div class="tiles">
            <div class="tile"><div class="eyebrow">Cash</div><div class="num">{{ register().totals.cashPaise | inr }}</div></div>
            <div class="tile"><div class="eyebrow">UPI / Bank</div><div class="num">{{ register().totals.upiPaise + register().totals.bankPaise | inr }}</div></div>
            <div class="tile"><div class="eyebrow pending">Pending</div><div class="num">{{ register().totals.pendingPaise | inr }}</div></div>
          </div>
          @if (register().totals.refundDuePaise > 0) {
            <div class="refund">Refund due on reversed sevas: {{ register().totals.refundDuePaise | inr }}</div>
          }
        </section>

        <nav class="chips" aria-label="Filter by seva">
          <button type="button" [attr.aria-pressed]="filter() === null" (click)="filter.set(null)">
            All <span class="n">{{ register().lines.length }}</span>
          </button>
          @for (s of register().sevas; track s.code) {
            <button type="button" [attr.aria-pressed]="filter() === s.code" (click)="filter.set(s.code)">
              {{ s.name }} <span class="n">{{ s.count }}</span>
            </button>
          }
        </nav>

        <section class="slots" aria-label="Seva slots">
          @for (s of register().sevas; track s.code) {
            <div class="card slot">
              <div class="slot-name">{{ s.name }}</div>
              <div class="slot-row">
                <span class="muted">{{ s.dailyLimit === null ? s.count + ' booked · no limit' : s.count + ' of ' + s.dailyLimit + ' booked' }}</span>
                <span class="pill" [class.bad]="s.isFull" [class.ok]="!s.isFull">{{ s.isFull ? 'Full' : 'Open' }}</span>
              </div>
            </div>
          }
        </section>

        <section aria-label="Bookings" class="lines">
          <div class="lines-head">
            <h2>{{ filterName() }}</h2>
            <span class="links">
              @if (ledger.isAccounts()) { <a class="link" routerLink="/sevas">Sevas</a> }
              <a class="link" [routerLink]="['/priest-list']" [queryParams]="{ date: day() }">Priest list</a>
            </span>
          </div>
          @for (l of lines(); track l.booking.id) {
            <a class="card line" [routerLink]="['/booking', l.booking.id]" [class.reversed]="l.isReversed">
              <div class="line-main">
                <div class="tags">
                  <span class="receipt num">{{ l.receiptNo }}</span>
                  <span class="pill seva">{{ l.sevaName }}</span>
                  @if (l.booking.state === 'pending') { <span class="pill warn">Not sent</span> }
                  @if (l.booking.state === 'rejected') { <span class="pill bad">Refused</span> }
                  @if (l.booking.needsReview) { <span class="pill warn">Review</span> }
                  @if (l.isReversed) { <span class="pill bad">Reversed</span> }
                </div>
                <div class="devotee">{{ l.booking.devoteeName }}</div>
                @if (l.booking.sankalpa; as s) {
                  <div class="muted">{{ sankalpaLine(s.gotra, s.nakshatra) }}</div>
                }
              </div>
              <div class="line-side">
                <div class="amount num">{{ l.booking.amountPaise | inr }}</div>
                @if (l.isReversed) {
                  @if (l.refundDuePaise > 0) { <span class="pill bad">Refund {{ l.refundDuePaise | inr }}</span> }
                } @else if (l.pendingPaise > 0) {
                  <span class="pill bad">Due {{ l.pendingPaise | inr }}</span>
                } @else {
                  <span class="pill" [class.info]="l.modes[0] !== 'cash'" [class.plain]="l.modes[0] === 'cash'">{{ modesLabel(l.modes) }}</span>
                }
              </div>
            </a>
          } @empty {
            <p class="empty muted">No sevas booked for this day yet.</p>
          }
        </section>
      </div>

      @if (ledger.canRecord()) {
        <a slot="fixed" class="fab" [routerLink]="['/book']" [queryParams]="{ date: day() }">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Book seva
        </a>
      }
    </ion-content>
  `,
  styles: `
    .top { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; max-width: 640px; margin: 0 auto; }
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
    .yatra-link { font-size: 12px; color: var(--my-muted); text-decoration: none; }
    .day-switch { display: flex; align-items: center; justify-content: space-between; background: var(--my-soft); border-radius: 12px; padding: 0 4px; }
    .day-switch button { width: 44px; height: 44px; border: none; background: transparent; color: #44403c; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .day-switch button:disabled { opacity: 0.35; }
    .day-label { text-align: center; }
    .day { font-size: 15px; font-weight: 600; }
    .muted { font-size: 12px; color: var(--my-muted); }

    .summary { background: var(--my-ink); color: #fff; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .summary-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .eyebrow { font-size: 12px; color: #d6d3d1; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .eyebrow.pending { color: #fca5a5; }
    .big { font-family: 'Space Grotesk', Inter, sans-serif; font-size: 32px; font-weight: 700; margin-top: 2px; }
    .count { background: #fde68a; color: #78350f; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .tile { background: var(--my-ink-2); border-radius: 10px; padding: 10px; font-size: 15px; font-weight: 600; }
    .tile .eyebrow { font-size: 11px; text-transform: none; letter-spacing: 0; margin-bottom: 2px; }
    .refund { font-size: 12px; color: #fecaca; }

    .chips { display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
    .chips button { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 20px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; background: #fff; color: var(--my-text); border: 1px solid var(--my-border); }
    .chips button[aria-pressed='true'] { background: var(--my-accent); color: #fff; border-color: var(--my-accent); }
    .n { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--my-soft); color: #44403c; }
    .chips button[aria-pressed='true'] .n { background: rgba(255, 255, 255, 0.22); color: #fff; }

    .slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .slot { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
    .slot-name { font-size: 13px; font-weight: 600; }
    .slot-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }

    .lines { display: flex; flex-direction: column; gap: 8px; }
    .lines-head { display: flex; justify-content: space-between; align-items: baseline; }
    .lines-head h2 { margin: 0; font-size: 15px; font-weight: 700; font-family: Inter, sans-serif; }
    .link { font-size: 14px; font-weight: 600; color: var(--my-accent); padding: 8px 0; }
    .links { display: flex; gap: 16px; }
    .line { padding: 12px; display: flex; gap: 12px; align-items: flex-start; text-decoration: none; color: inherit; }
    .line.reversed .devotee, .line.reversed .amount { text-decoration: line-through; color: var(--my-muted); }
    .line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .tags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .receipt { font-size: 11px; font-weight: 700; color: var(--my-muted); }
    .devotee { font-size: 15px; font-weight: 600; }
    .line-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .amount { font-size: 15px; font-weight: 700; }
    .empty { text-align: center; padding: 24px 0; font-size: 14px; }

    .fab { position: fixed; right: 16px; bottom: calc(20px + var(--ion-safe-area-bottom, 0px)); display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 20px; border-radius: 26px; background: var(--my-accent); color: #fff; font-size: 15px; font-weight: 700; text-decoration: none; box-shadow: 0 6px 16px rgba(120, 53, 15, 0.28); }
  `,
})
export class RegisterPage {
  readonly ledger = inject(LedgerService);

  private readonly yatra = computed(() => this.ledger.yatra()!);
  readonly day = signal(clampDay(istDay(new Date()), this.yatra().startsOn, this.yatra().endsOn));
  readonly filter = signal<string | null>(null);

  readonly register = computed(() => dayRegister(this.ledger.ledger(), this.day()));
  readonly lines = computed(() => {
    const code = this.filter();
    return code === null ? this.register().lines : this.register().lines.filter((l) => l.booking.sevaCode === code);
  });
  readonly filterName = computed(() => {
    const code = this.filter();
    return code === null ? "This day's bookings" : (this.register().sevas.find((s) => s.code === code)?.name ?? code);
  });
  readonly dayLabel = computed(() => formatDay(this.day()));
  readonly dayNo = computed(() => dayNumber(this.day(), this.yatra().startsOn, this.yatra().endsOn));
  readonly atStart = computed(() => this.day() <= this.yatra().startsOn);
  readonly atEnd = computed(() => this.day() >= this.yatra().endsOn);

  move(days: number): void {
    this.day.set(clampDay(addDays(this.day(), days), this.yatra().startsOn, this.yatra().endsOn));
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.ledger.sync();
    await event.target.complete();
  }

  sankalpaLine(gotra: string | null, nakshatra: string | null): string {
    return [gotra && `${gotra} gotra`, nakshatra && `${nakshatra} nakshatra`].filter(Boolean).join(' · ');
  }

  modesLabel(modes: string[]): string {
    return modes.length === 0 ? 'Paid' : modes.map((m) => (m === 'upi' ? 'UPI' : m[0].toUpperCase() + m.slice(1))).join(' + ');
  }
}
