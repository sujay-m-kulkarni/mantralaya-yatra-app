import { Component, computed, inject } from '@angular/core';

import { LedgerService } from './ledger.service';

/** Shows whether this phone's entries have reached the server; tap to sync now. */
@Component({
  selector: 'app-sync-chip',
  template: `
    <button type="button" class="chip" [class]="tone()" (click)="ledger.sync()" [attr.aria-label]="label() + '. Tap to sync now'">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" [class.spin]="ledger.status().phase === 'syncing'">
        <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" />
      </svg>
      <span>{{ label() }}</span>
    </button>
  `,
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: 18px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
    .ok { background: var(--my-ok-bg); color: var(--my-ok); }
    .waiting { background: var(--my-warn-bg); color: var(--my-warn); }
    .bad { background: var(--my-bad-bg); color: var(--my-bad); }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  `,
})
export class SyncChipComponent {
  readonly ledger = inject(LedgerService);

  readonly label = computed(() => {
    const status = this.ledger.status();
    const pending = this.ledger.pending();
    if (status.phase === 'syncing') return 'Syncing…';
    if (status.phase === 'offline') return pending > 0 ? `Offline · ${pending} to send` : 'Offline';
    if (status.phase === 'error') return pending > 0 ? `Sync failed · ${pending} to send` : 'Sync failed';
    if (pending > 0) return `${pending} to send`;
    return status.lastSyncedAt ? 'Synced' : 'Not synced yet';
  });

  readonly tone = computed(() => {
    const phase = this.ledger.status().phase;
    if (phase === 'error') return 'chip bad';
    if (phase === 'offline' || this.ledger.pending() > 0 || !this.ledger.status().lastSyncedAt) return 'chip waiting';
    return 'chip ok';
  });
}
