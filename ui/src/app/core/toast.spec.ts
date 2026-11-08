import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { ToastService } from './toast';

describe('ToastService', () => {
  it('shows a green note for a moment, then hides it', fakeAsync(() => {
    const toast = TestBed.inject(ToastService);
    toast.ok('Seva saved');
    expect(toast.current()).toEqual({ text: 'Seva saved', kind: 'ok' });
    tick(ToastService.SHOW_MS);
    expect(toast.current()).toBeNull();
  }));

  it('a new note replaces the old one and gets its own time', fakeAsync(() => {
    const toast = TestBed.inject(ToastService);
    toast.ok('First');
    tick(ToastService.SHOW_MS - 100);
    toast.ok('Second');
    tick(200);
    expect(toast.current()?.text).toBe('Second');
    tick(ToastService.SHOW_MS);
    expect(toast.current()).toBeNull();
  }));
});
