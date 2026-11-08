import { Component, inject } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { LedgerService } from './core/ledger.service';

/** How often to sync while the app is open and online. */
const SYNC_EVERY_MS = 60_000;

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class App {
  private readonly ledger = inject(LedgerService);

  constructor() {
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
