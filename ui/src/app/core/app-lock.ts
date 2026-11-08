// Locks the app behind the phone's own fingerprint, face or screen PIN.
//
// The fingerprint never leaves the phone: Android checks it and tells the app only "it was the owner". So this
// protects the books from someone holding your phone; the API key (built into the app) is what lets the server
// trust the app. Locks when the app opens and when it comes back after a while in the background.

import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

/** Back in the app within this long: no need to unlock again (switching to WhatsApp to send a receipt). */
export const RELOCK_AFTER_MS = 2 * 60_000;

/** The parts of the biometric plugin the lock uses; replaced in tests. */
export interface Biometrics {
  isAvailable(options: { useFallback: boolean }): Promise<{ isAvailable: boolean }>;
  verifyIdentity(options: { reason: string; title: string; subtitle?: string; useFallback: boolean; negativeButtonText?: string }): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class AppLockService {
  /** Replaced in tests. */
  biometrics: Biometrics = NativeBiometric;
  native = Capacitor.isNativePlatform();
  now: () => number = () => Date.now();

  /** True while the lock screen is showing. */
  readonly locked = signal(false);
  /** Counts each unlock (and the start, when there is no lock): the app plays the darshan on each. */
  readonly opened = signal(0);
  /** What the This build panel shows. */
  readonly status = signal('Off in a browser');
  readonly error = signal<string | null>(null);

  private hiddenAt: number | null = null;
  private prompting = false;

  /** Locks at start-up on a phone, and watches the app going to the background and back. */
  async init(): Promise<void> {
    // With no lock, the app is open straight away; with one, unlock() counts the opening.
    const locks = await this.startLock().catch(() => false);
    if (!locks) this.opened.update((n) => n + 1);
  }

  /** True when the lock is on (the phone has a fingerprint, face or screen lock). */
  private async startLock(): Promise<boolean> {
    if (!this.native) return false;
    let available = false;
    try {
      available = (await this.biometrics.isAvailable({ useFallback: true })).isAvailable;
    } catch {
      available = false;
    }
    if (!available) {
      // No fingerprint, face or screen lock set up on the phone: there is nothing to unlock with.
      this.status.set('Off: set a fingerprint or screen lock on the phone');
      return false;
    }
    this.status.set('Fingerprint, face or phone PIN');
    this.locked.set(true);
    await App.addListener('pause', () => this.wentToBackground());
    await App.addListener('resume', () => this.cameBack());
    void this.unlock();
    return true;
  }

  wentToBackground(): void {
    this.hiddenAt = this.now();
  }

  cameBack(): void {
    if (this.hiddenAt !== null && this.now() - this.hiddenAt >= RELOCK_AFTER_MS) {
      this.locked.set(true);
      void this.unlock();
    }
    this.hiddenAt = null;
  }

  /** Shows the phone's own fingerprint/face prompt; the phone's PIN works as a fallback. */
  async unlock(): Promise<void> {
    if (!this.locked() || this.prompting) return;
    this.prompting = true;
    this.error.set(null);
    try {
      await this.biometrics.verifyIdentity({
        title: 'Unlock Mantralaya Yatra',
        subtitle: 'The seva books are protected',
        reason: 'Unlock the seva books',
        negativeButtonText: 'Cancel',
        useFallback: true,
      });
      this.locked.set(false);
      this.opened.update((n) => n + 1);
    } catch {
      this.error.set('Not unlocked. Tap Unlock to try again.');
    } finally {
      this.prompting = false;
    }
  }
}
