import { Component, effect, inject, signal, untracked } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AppLockService } from './core/app-lock';
import { Darshan } from './darshan';
import { LedgerService } from './core/ledger.service';
import { ToastService } from './core/toast';

/** How often to sync while the app is open and online. */
const SYNC_EVERY_MS = 60_000;

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, Darshan],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      @if (toast.current(); as t) {
        <div class="toast" [class.ok]="t.kind === 'ok'" role="status" aria-live="polite" (click)="toast.dismiss()">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {{ t.text }}
        </div>
      }
      @if (darshan()) {
        <!-- Each time the app opens (or is unlocked again), before the books. -->
        <app-darshan (done)="darshan.set(false)" />
      }
      @if (lock.locked()) {
        <!-- Covers everything until the phone confirms the owner; the books stay hidden underneath. -->
        <div class="lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
          <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#B45309" /><path d="M32 12c4 7 10 11 10 19a10 10 0 0 1-20 0c0-8 6-12 10-19Z" fill="#FDE68A" /><path d="M18 48h28" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" /></svg>
          <h1 id="lock-title">Mantralaya Yatra</h1>
          <p>Unlock with your fingerprint, face or phone PIN.</p>
          <button type="button" class="btn" (click)="lock.unlock()">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a8 8 0 0 0 1 4" /><path d="M8 12a4 4 0 0 1 8 0v1a12 12 0 0 0 1 5" /><path d="M5 13v-1a7 7 0 0 1 12-5" /><path d="M19 11v2" /><path d="M9 16a14 14 0 0 0 1 4" /></svg>
            Unlock
          </button>
          @if (lock.error()) { <p class="error" role="alert">{{ lock.error() }}</p> }
        </div>
      }
    </ion-app>
  `,
  styles: `
    .toast { position: fixed; left: 16px; right: 16px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 8000; display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-radius: 12px; font-size: 15px; font-weight: 600; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); animation: toast-in .25s ease-out; }
    .toast.ok { background: #15803d; color: #fff; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
    .lock { position: fixed; inset: 0; z-index: 10000; background: var(--my-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; }
    .lock h1 { margin: 8px 0 0; font-size: 24px; }
    .lock p { margin: 0; color: var(--my-muted); font-size: 15px; }
    .lock .btn { max-width: 280px; margin-top: 16px; }
    .lock .error { color: var(--my-bad); font-weight: 600; font-size: 14px; }
  `,
})
export class App {
  private readonly ledger = inject(LedgerService);
  readonly lock = inject(AppLockService);
  readonly toast = inject(ToastService);
  readonly darshan = signal(false);

  constructor() {
    effect(() => {
      if (this.lock.opened() > 0) untracked(() => this.darshan.set(true));
    });
    void this.lock.init();
    // Entries recorded offline go up as soon as there is a network, and other phones' entries come down.
    void this.ledger.init().then(() => this.ledger.sync());
    void Network.addListener('networkStatusChange', (status) => {
      if (status.connected) void this.ledger.sync();
    });
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('resume', () => void this.ledger.sync());
    }
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.ledger.sync();
    }, SYNC_EVERY_MS);
  }
}
