import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { ApiError } from '../core/api';
import { formatDay } from '../core/dates';
import { LedgerService } from '../core/ledger.service';
import { YatraSummary } from '../core/models';
import { APP_VERSION, DEFAULT_SERVER } from '../core/version';

/**
 * First run, or changing yatra: which server, who you are, and which yatra this phone keeps books for.
 * Sign-in is by the API's Development header for now; Entra email sign-in replaces the name and email fields later.
 */
@Component({
  selector: 'app-setup',
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Set up</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-body">
        <form class="card form" (ngSubmit)="connect()">
          <h2>Server and you</h2>
          <div class="field">
            <label for="server">Server address</label>
            <input id="server" name="server" type="url" inputmode="url" [(ngModel)]="server" required />
            <span class="hint">On a phone, your laptop's Wi-Fi address, e.g. http://192.168.1.20:5180</span>
          </div>
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" [(ngModel)]="name" autocomplete="name" required />
            <span class="hint">Shown to the accountant and used in draft receipt numbers</span>
          </div>
          <div class="field">
            <label for="email">Your email</label>
            <input id="email" name="email" type="email" [(ngModel)]="email" autocomplete="email" required />
            <span class="hint">The accountant adds you to a yatra with this email</span>
          </div>
          <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Connecting…' : 'Connect' }}</button>
        </form>

        @if (error()) {
          <div class="banner bad" role="alert">{{ error() }}</div>
        }

        @if (yatras(); as list) {
          <section>
            <h2 class="section-label">Your yatras</h2>
            @if (list.length === 0) {
              <p class="muted">You are not in a yatra yet. Ask the accountant to add {{ email }}, or start one below.</p>
            }
            <div class="list">
              @for (y of list; track y.id) {
                <button class="card yatra" type="button" (click)="choose(y)" [attr.aria-current]="y.id === ledger.yatra()?.id">
                  <span class="yatra-name">{{ y.name }}</span>
                  <span class="muted">{{ day(y.startsOn) }} – {{ day(y.endsOn) }}</span>
                  <span class="pill plain">{{ y.role }}</span>
                </button>
              }
            </div>
          </section>

          <form class="card form" (ngSubmit)="create()">
            <h2>Start a new yatra</h2>
            <p class="muted">You become its accountant. The four sevas are added without rates; you set those.</p>
            <div class="field">
              <label for="yname">Name</label>
              <input id="yname" name="yname" [(ngModel)]="newName" placeholder="Mantralaya Yatra 2026" required />
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="starts">Starts on</label>
                <input id="starts" name="starts" type="date" [(ngModel)]="startsOn" required />
              </div>
              <div class="field">
                <label for="ends">Ends on</label>
                <input id="ends" name="ends" type="date" [(ngModel)]="endsOn" required />
              </div>
            </div>
            <button class="btn secondary" type="submit" [disabled]="busy()">Create yatra</button>
          </form>
        }

        <p class="muted version">Version {{ version }}</p>
      </div>
    </ion-content>
  `,
  styles: `
    .form { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    h2 { margin: 0; font-size: 18px; }
    .muted { color: var(--my-muted); font-size: 13px; margin: 0; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .yatra { text-align: left; padding: 14px; display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; font: inherit; color: inherit; cursor: pointer; min-height: 64px; }
    .yatra[aria-current='true'] { border: 2px solid var(--my-accent); background: var(--my-accent-soft); }
    .yatra-name { font-weight: 700; font-size: 15px; }
    .yatra .pill { grid-row: 1 / span 2; grid-column: 2; align-self: center; text-transform: capitalize; }
    .version { text-align: center; }
  `,
})
export class SetupPage implements OnInit {
  readonly ledger = inject(LedgerService);
  private readonly router = inject(Router);

  server = DEFAULT_SERVER;
  name = '';
  email = '';
  newName = '';
  startsOn = '';
  endsOn = '';
  readonly version = APP_VERSION;

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly yatras = signal<YatraSummary[] | null>(null);

  async ngOnInit(): Promise<void> {
    await this.ledger.init();
    const s = this.ledger.settings();
    if (s) {
      this.server = s.baseUrl;
      this.name = s.displayName;
      this.email = s.devEmail ?? '';
      await this.connect();
    }
  }

  day(d: string): string {
    return formatDay(d);
  }

  async connect(): Promise<void> {
    if (!this.server.trim() || !this.name.trim() || !this.email.trim()) {
      this.error.set('Fill in the server address, your name and your email.');
      return;
    }
    await this.run(async () => {
      await this.ledger.saveSettings({
        baseUrl: this.server.trim(),
        displayName: this.name.trim(),
        devUser: this.email.trim().toLowerCase(),
        devEmail: this.email.trim().toLowerCase(),
        token: null,
      });
      this.yatras.set(await this.ledger.api().listYatras());
    });
  }

  async create(): Promise<void> {
    await this.run(async () => {
      const yatra = await this.ledger.api().createYatra({
        name: this.newName.trim(),
        startsOn: this.startsOn,
        endsOn: this.endsOn,
        displayName: this.name.trim(),
      });
      await this.choose(yatra);
    });
  }

  async choose(yatra: YatraSummary): Promise<void> {
    await this.ledger.selectYatra(yatra);
    void this.ledger.sync();
    await this.router.navigateByUrl('/register', { replaceUrl: true });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (e) {
      this.error.set(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
