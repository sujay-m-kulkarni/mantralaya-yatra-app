import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import { LedgerService } from './core/ledger.service';

/** Screens that need a server, a name and a yatra send the volunteer to setup first. */
const needsYatra = async () => {
  // Both injected before the first await: inject() only works synchronously inside the guard.
  const ledger = inject(LedgerService);
  const router = inject(Router);
  await ledger.init();
  return ledger.settings() && ledger.yatra() ? true : router.parseUrl('/setup');
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'register' },
  { path: 'setup', loadComponent: () => import('./pages/setup.page').then((m) => m.SetupPage) },
  { path: 'register', canActivate: [needsYatra], loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage) },
  { path: 'book', canActivate: [needsYatra], loadComponent: () => import('./pages/book.page').then((m) => m.BookPage) },
  { path: 'booking/:id', canActivate: [needsYatra], loadComponent: () => import('./pages/booking.page').then((m) => m.BookingPage) },
  { path: 'sevas', canActivate: [needsYatra], loadComponent: () => import('./pages/sevas.page').then((m) => m.SevasPage) },
  { path: 'priest-list', canActivate: [needsYatra], loadComponent: () => import('./pages/priest-list.page').then((m) => m.PriestListPage) },
  { path: '**', redirectTo: 'register' },
];
