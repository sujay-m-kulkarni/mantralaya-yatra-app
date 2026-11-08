import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { Fetch } from './api';
import { BrowserStore } from './store/browser-store';
import { LocalStore } from './store/local-store';
import { SqliteStore } from './store/sqlite-store';

/** Where the phone keeps the books and settings: SQLite on Android, localStorage in a browser. */
export const LOCAL_STORE = new InjectionToken<LocalStore>('LocalStore', {
  providedIn: 'root',
  factory: () => (Capacitor.getPlatform() === 'android' ? new SqliteStore() : new BrowserStore()),
});

/** The API's HTTP calls; replaced by a fake in tests. */
export const FETCH = new InjectionToken<Fetch>('Fetch', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});
