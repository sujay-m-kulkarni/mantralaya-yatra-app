import { TestBed } from '@angular/core/testing';

import { ApiClient } from './api';
import { AppLockService, Biometrics, RELOCK_AFTER_MS } from './app-lock';

/** Stands in for the phone's fingerprint prompt. */
class FakeBiometrics implements Biometrics {
  available = true;
  accept = true;
  prompts = 0;

  async isAvailable(): Promise<{ isAvailable: boolean }> {
    return { isAvailable: this.available };
  }

  async verifyIdentity(): Promise<void> {
    this.prompts++;
    if (!this.accept) throw new Error('Authentication failed');
  }
}

describe('AppLockService', () => {
  let lock: AppLockService;
  let bio: FakeBiometrics;
  let now: number;

  beforeEach(() => {
    lock = TestBed.inject(AppLockService);
    bio = new FakeBiometrics();
    lock.biometrics = bio;
    now = 0;
    lock.now = () => now;
    // init() also registers app pause/resume listeners; the tests drive those transitions directly.
    lock.native = true;
  });

  it('starts locked on a phone and the fingerprint unlocks it', async () => {
    await lock.init();
    await Promise.resolve();
    expect(bio.prompts).toBe(1);
    expect(lock.locked()).toBeFalse();
  });

  it('stays locked when the fingerprint is refused, and Unlock asks again', async () => {
    bio.accept = false;
    await lock.init();
    await lock.unlock();
    expect(lock.locked()).toBeTrue();
    expect(lock.error()).toContain('Not unlocked');

    bio.accept = true;
    await lock.unlock();
    expect(lock.locked()).toBeFalse();
  });

  it('does not lock when the phone has no fingerprint or screen lock, and says so', async () => {
    bio.available = false;
    await lock.init();
    expect(lock.locked()).toBeFalse();
    expect(lock.status()).toContain('set a fingerprint');
  });

  it('is off in a browser', async () => {
    lock.native = false;
    await lock.init();
    expect(lock.locked()).toBeFalse();
    expect(bio.prompts).toBe(0);
  });

  it('a quick trip to WhatsApp does not lock; a long absence does', async () => {
    lock.locked.set(false);
    lock.wentToBackground();
    now += RELOCK_AFTER_MS - 1000;
    lock.cameBack();
    expect(lock.locked()).toBeFalse();

    lock.wentToBackground();
    now += RELOCK_AFTER_MS;
    bio.accept = false;
    lock.cameBack();
    expect(lock.locked()).toBeTrue();
  });
});

describe('AppLockService and the opening darshan', () => {
  let lock: AppLockService;
  let bio: FakeBiometrics;

  beforeEach(() => {
    lock = TestBed.inject(AppLockService);
    bio = new FakeBiometrics();
    lock.biometrics = bio;
    lock.native = true;
  });

  it('counts an opening only once the fingerprint unlocks the app', async () => {
    bio.accept = false;
    await lock.init();
    await lock.unlock();
    expect(lock.opened()).toBe(0);

    bio.accept = true;
    await lock.unlock();
    expect(lock.opened()).toBe(1);
  });

  it('counts the start as an opening when there is no lock', async () => {
    bio.available = false;
    await lock.init();
    expect(lock.opened()).toBe(1);
  });

  it('counts the start as an opening in a browser', async () => {
    lock.native = false;
    await lock.init();
    expect(lock.opened()).toBe(1);
  });
});

describe('ApiClient with the built-in key', () => {
  it('sends X-Api-Key and no dev header, and explains a refused key', async () => {
    let sent: Record<string, string> = {};
    const api = new ApiClient({ baseUrl: 'https://api.test', apiKey: 'k'.repeat(40) }, async (_u, init) => {
      sent = init!.headers as Record<string, string>;
      return new Response('{}', { status: 401 });
    });

    await expectAsync(api.listYatras()).toBeRejectedWithError(/did not accept this app's key/);
    expect(sent['X-Api-Key']).toBe('k'.repeat(40));
    expect(sent['X-Dev-User']).toBeUndefined();
  });
});
