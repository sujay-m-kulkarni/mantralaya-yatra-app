import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { InrPipe } from '../core/inr.pipe';
import { sortedSevaTypes } from '../core/ledger';
import { LedgerService } from '../core/ledger.service';
import { SevaType } from '../core/models';
import { paiseToInput, parseRupees } from '../core/money';
import { KEEP_DELETED_DAYS, MAX_SEVA_NAME, keptUntil, sevaProblem, suggestCode } from '../core/sevas';
import { formatDay } from '../core/dates';
import { ToastService } from '../core/toast';

/** The accountant creates the yatra's sevas and sets each one's fixed price. Needs network: sevas live on the server. */
@Component({
  selector: 'app-sevas',
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, InrPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/register" text="" /></ion-buttons>
        <ion-title>Sevas</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-body">
        @if (!ledger.isAccounts()) {
          <div class="banner info">Only the accountant can create or change sevas.</div>
        }

        @if (editing() === null) {
          @if (sevas().length === 0) {
            <div class="card empty">
              <h2>No sevas yet</h2>
              <p class="muted">Create each seva the yatra offers, with its price. The price is fixed: a booking always takes it, and it cannot be changed on the booking form.</p>
            </div>
          }
          <div class="list">
            @for (s of sevas(); track s.code) {
              <button type="button" class="card seva" [class.off]="!s.isActive" (click)="edit(s)" [disabled]="!ledger.isAccounts()">
                <span class="row">
                  <span class="name">{{ s.name }}</span>
                  <span class="num price">{{ s.ratePaise === null ? 'No price' : (s.ratePaise | inr) }}</span>
                </span>
                <span class="row muted">
                  <span>Code <strong class="code">{{ s.code }}</strong> · receipts {{ s.code }}-0001</span>
                  <span>{{ s.dailyLimit ? s.dailyLimit + ' a day' : 'No daily limit' }}</span>
                </span>
                <span class="row muted">
                  <span>{{ s.requiresSankalpa ? 'Needs sankalpa' : 'Sankalpa optional' }}</span>
                  @if (!s.isActive) { <span class="pill plain">Hidden</span> }
                  @if (s.ratePaise === null) { <span class="pill warn">Set a price to book</span> }
                </span>
              </button>
            }
          </div>
          @if (deleted().length > 0) {
            <h2 class="section-label">Deleted · kept {{ keepDays }} days</h2>
            <div class="list">
              @for (s of deleted(); track s.code) {
                <div class="card seva off">
                  <span class="row">
                    <span class="name">{{ s.name }}</span>
                    <span class="num price">{{ s.ratePaise === null ? 'No price' : (s.ratePaise | inr) }}</span>
                  </span>
                  <span class="row muted">
                    <span>Code <strong class="code">{{ s.code }}</strong> · kept until {{ untilLabel(s) }}</span>
                    @if (ledger.isAccounts()) {
                      <button class="link-btn" type="button" (click)="restore(s)" [disabled]="busy()">Restore</button>
                    }
                  </span>
                </div>
              }
            </div>
          }
          @if (listError()) { <div class="banner bad" role="alert">{{ listError() }}</div> }
          @if (ledger.isAccounts()) {
            <button class="btn" type="button" (click)="add()">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add a seva
            </button>
          }
        } @else {
          <form class="card form" (ngSubmit)="save()">
            <h2>{{ isNew() ? 'New seva' : 'Change ' + editing()!.name }}</h2>
            <div class="field">
              <label for="sname">Name</label>
              <input id="sname" name="sname" [(ngModel)]="name" (ngModelChange)="onName($event)" [maxlength]="maxName" placeholder="Sarva Seva" required />
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="scode">Short code</label>
                <input id="scode" name="scode" [(ngModel)]="code" (ngModelChange)="onCode($event)" [readonly]="!isNew()" maxlength="5" autocapitalize="characters" placeholder="SRV" required />
                <span class="hint">{{ isNew() ? 'Receipts are numbered ' + (code || 'SRV') + '-0001. Cannot change later.' : 'Fixed: receipts use it.' }}</span>
              </div>
              <div class="field">
                <label for="sprice">Price (₹)</label>
                <input id="sprice" name="sprice" class="num" inputmode="decimal" [(ngModel)]="price" placeholder="1001" required />
                @if (!isNew()) { <span class="hint">A new price applies to new bookings only.</span> }
              </div>
            </div>
            <div class="field">
              <label for="slimit">Daily limit (optional)</label>
              <input id="slimit" name="slimit" class="num" inputmode="numeric" [(ngModel)]="limit" placeholder="No limit" />
              <span class="hint">Most bookings allowed for one day. Leave empty for no limit.</span>
            </div>
            <label class="check"><input type="checkbox" name="ssank" [(ngModel)]="requiresSankalpa" /> Needs sankalpa details for the priest</label>
            @if (!isNew()) {
              <label class="check"><input type="checkbox" name="sactive" [(ngModel)]="isActive" /> Offered for booking (untick to hide it)</label>
            }
            @if (error()) { <div class="banner bad" role="alert">{{ error() }}</div> }
            @if (confirmDelete()) {
              <div class="banner warn confirm" role="alertdialog" aria-labelledby="del-title">
                <strong id="del-title">Delete {{ editing()!.name }}?</strong>
                <span>It disappears from booking and from this list. Bookings already made keep it. You can restore it for {{ keepDays }} days.</span>
                <div class="actions">
                  <button class="btn secondary" type="button" (click)="confirmDelete.set(false)" [disabled]="saving()">Keep it</button>
                  <button class="btn danger" type="button" (click)="remove()" [disabled]="saving()">{{ saving() ? 'Deleting…' : 'Delete' }}</button>
                </div>
              </div>
            } @else {
              <div class="actions">
                <button class="btn secondary" type="button" (click)="cancel()" [disabled]="saving()">Cancel</button>
                <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save seva' }}</button>
              </div>
              @if (!isNew()) {
                <button class="delete" type="button" (click)="confirmDelete.set(true)" [disabled]="saving()">Delete this seva</button>
              }
            }
          </form>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 8px; }
    .seva { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; text-align: left; font: inherit; color: var(--my-text); cursor: pointer; }
    .seva:disabled { cursor: default; }
    .seva.off { opacity: .65; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .name { font-weight: 700; font-size: 15px; }
    .price { font-weight: 700; font-size: 15px; }
    .muted { color: var(--my-muted); font-size: 12px; }
    .code { color: var(--my-text); letter-spacing: .04em; }
    .empty { padding: 16px; }
    .empty h2 { margin: 0 0 6px; font-size: 17px; }
    .empty p { margin: 0; }
    .form { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .form h2 { margin: 0; font-size: 17px; }
    .check { display: flex; gap: 10px; align-items: center; font-size: 14px; min-height: 40px; }
    .check input { width: 20px; height: 20px; accent-color: var(--my-accent); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .section-label { margin: 8px 0 0; }
    .confirm { display: flex; flex-direction: column; gap: 8px; }
    .btn.danger { background: var(--my-bad); border-color: var(--my-bad); color: #fff; }
    .delete { align-self: center; min-height: 44px; padding: 0 12px; border: none; background: transparent; color: var(--my-bad); font: inherit; font-weight: 600; cursor: pointer; }
    .link-btn { min-height: 36px; padding: 0 8px; border: none; background: transparent; color: var(--my-accent); font: inherit; font-weight: 700; cursor: pointer; }
  `,
})
export class SevasPage {
  readonly ledger = inject(LedgerService);
  readonly maxName = MAX_SEVA_NAME;

  private readonly toast = inject(ToastService);
  readonly keepDays = KEEP_DELETED_DAYS;

  readonly sevas = computed(() => sortedSevaTypes(this.ledger.ledger().sevaTypes).filter((s) => !s.deletedAt));
  readonly deleted = computed(() => sortedSevaTypes(this.ledger.ledger().sevaTypes).filter((s) => !!s.deletedAt));
  /** The seva being changed; a blank one while adding; null shows the list. */
  readonly editing = signal<SevaType | null>(null);
  readonly isNew = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);

  name = '';
  code = '';
  price = '';
  limit = '';
  requiresSankalpa = true;
  isActive = true;
  private codeTouched = false;

  add(): void {
    this.isNew.set(true);
    this.codeTouched = false;
    this.fill({ id: '', code: '', name: '', ratePaise: null, dailyLimit: null, requiresSankalpa: true, isActive: true, sortOrder: this.sevas().length + 1 });
  }

  edit(s: SevaType): void {
    this.isNew.set(false);
    this.codeTouched = true;
    this.fill(s);
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set(null);
    this.confirmDelete.set(false);
  }

  untilLabel(s: SevaType): string {
    const day = keptUntil(s);
    return day ? formatDay(day) : '';
  }

  async remove(): Promise<void> {
    const current = this.editing();
    if (!current) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.ledger.deleteSevaType(current.code);
      this.toast.ok(`${current.name} deleted · restore it within ${KEEP_DELETED_DAYS} days`);
      this.confirmDelete.set(false);
      this.editing.set(null);
    } catch (e) {
      this.error.set(`Not deleted: ${e instanceof Error ? e.message : String(e)} This needs network.`);
    } finally {
      this.saving.set(false);
    }
  }

  async restore(s: SevaType): Promise<void> {
    this.busy.set(true);
    this.listError.set(null);
    try {
      await this.ledger.restoreSevaType(s.code);
      this.toast.ok(`${s.name} restored`);
    } catch (e) {
      this.listError.set(`Not restored: ${e instanceof Error ? e.message : String(e)} This needs network.`);
    } finally {
      this.busy.set(false);
    }
  }

  onName(name: string): void {
    if (this.isNew() && !this.codeTouched) {
      this.code = suggestCode(name, this.ledger.ledger().sevaTypes.map((s) => s.code));
    }
  }

  onCode(code: string): void {
    this.codeTouched = true;
    this.code = code.toUpperCase().replace(/[^A-Z]/g, '');
  }

  async save(): Promise<void> {
    const current = this.editing();
    if (!current) return;
    const ratePaise = parseRupees(this.price);
    const dailyLimit = this.limit.trim() ? Number(this.limit.trim()) : null;
    const seva = { code: this.code, name: this.name.trim(), ratePaise, dailyLimit };
    const problem = sevaProblem(seva, this.ledger.ledger().sevaTypes, this.isNew());
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      await this.ledger.saveSevaType(this.code, {
        name: seva.name,
        ratePaise,
        dailyLimit,
        requiresSankalpa: this.requiresSankalpa,
        isActive: this.isNew() ? true : this.isActive,
        sortOrder: current.sortOrder,
      });
      this.editing.set(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.error.set(`Not saved: ${message} Sevas are kept on the server, so this needs network.`);
    } finally {
      this.saving.set(false);
    }
  }

  private fill(s: SevaType): void {
    this.confirmDelete.set(false);
    this.name = s.name;
    this.code = s.code;
    this.price = paiseToInput(s.ratePaise);
    this.limit = s.dailyLimit === null ? '' : String(s.dailyLimit);
    this.requiresSankalpa = s.requiresSankalpa;
    this.isActive = s.isActive;
    this.error.set(null);
    this.editing.set(s);
  }
}
