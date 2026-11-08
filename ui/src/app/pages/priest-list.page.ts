import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { addDays, clampDay, dayNumber, formatDay, istDay } from '../core/dates';
import { priestList, priestListText } from '../core/ledger';
import { LedgerService } from '../core/ledger.service';
import { shareText } from '../core/receipt';

/** The list the priest reads from each morning: the day's sevas with sankalpa details. Shared as text or printed. */
@Component({
  selector: 'app-priest-list',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/register" text="" /></ion-buttons>
        <ion-title>Priest list</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-body">
        <div class="day-switch">
          <button type="button" aria-label="Previous day" (click)="move(-1)">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div class="day-label">
            <div class="day">{{ label() }}</div>
            <div class="muted">{{ count() }} sevas{{ dayNo() ? ' · Day ' + dayNo() : '' }}</div>
          </div>
          <button type="button" aria-label="Next day" (click)="move(1)">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>

        @for (g of groups(); track g.code) {
          <section class="card group">
            <h2>{{ g.name }} <span class="muted">({{ g.entries.length }})</span></h2>
            <ol>
              @for (e of g.entries; track e.receiptNo) {
                <li>
                  <div class="name">{{ e.devoteeName }}</div>
                  @if (e.sankalpa; as s) {
                    <div class="muted">
                      {{ [s.onBehalfOf, s.gotra && s.gotra + ' gotra', s.nakshatra && s.nakshatra + ' nakshatra', s.rashi && s.rashi + ' rashi', s.occasion].filter(present).join(' · ') }}
                    </div>
                  }
                  <div class="receipt num">{{ e.receiptNo }}</div>
                </li>
              }
            </ol>
          </section>
        } @empty {
          <p class="muted empty">No sevas for this day.</p>
        }

        @if (groups().length > 0) {
          <div class="grid-2 no-print">
            <button class="btn" type="button" (click)="share()">Share</button>
            <button class="btn secondary" type="button" (click)="print()">Print</button>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .day-switch { display: flex; align-items: center; justify-content: space-between; background: var(--my-soft); border-radius: 12px; padding: 0 4px; }
    .day-switch button { width: 44px; height: 44px; border: none; background: transparent; color: #44403c; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .day-label { text-align: center; }
    .day { font-size: 15px; font-weight: 600; }
    .muted { font-size: 13px; color: var(--my-muted); font-weight: 400; }
    .group { padding: 14px 16px; }
    h2 { margin: 0 0 8px; font-size: 17px; }
    ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 10px; }
    .name { font-weight: 600; font-size: 15px; }
    .receipt { font-size: 11px; color: var(--my-muted); }
    .empty { text-align: center; padding: 24px 0; }
    @media print { .no-print, ion-header, .day-switch button { display: none !important; } }
  `,
})
export class PriestListPage implements OnInit {
  readonly ledger = inject(LedgerService);
  readonly date = input<string>();

  private readonly yatra = computed(() => this.ledger.yatra()!);
  readonly day = signal('');
  readonly groups = computed(() => (this.day() ? priestList(this.ledger.ledger(), this.day()) : []));
  readonly count = computed(() => this.groups().reduce((s, g) => s + g.entries.length, 0));
  readonly label = computed(() => (this.day() ? formatDay(this.day()) : ''));
  readonly dayNo = computed(() => (this.day() ? dayNumber(this.day(), this.yatra().startsOn, this.yatra().endsOn) : null));

  readonly present = (v: string | null | undefined): boolean => !!v;

  ngOnInit(): void {
    this.day.set(clampDay(this.date() ?? istDay(new Date()), this.yatra().startsOn, this.yatra().endsOn));
  }

  move(days: number): void {
    this.day.set(clampDay(addDays(this.day(), days), this.yatra().startsOn, this.yatra().endsOn));
  }

  async share(): Promise<void> {
    await shareText(priestListText(this.yatra().name, this.label(), this.groups()), 'Priest list').catch(() => undefined);
  }

  print(): void {
    window.print();
  }
}
