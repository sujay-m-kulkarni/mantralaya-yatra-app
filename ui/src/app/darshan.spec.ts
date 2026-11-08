import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { DARSHAN_FADE_MS, DARSHAN_MS, DARSHAN_STILL_MS, Darshan } from './darshan';

describe('Darshan', () => {
  let fixture: ComponentFixture<Darshan>;
  let darshan: Darshan;
  let done: number;

  function start(reducedMotion: boolean): void {
    fixture = TestBed.createComponent(Darshan);
    darshan = fixture.componentInstance;
    darshan.reducedMotion = () => reducedMotion;
    done = 0;
    darshan.done.subscribe(() => done++);
    fixture.detectChanges();
  }

  it('shows the Brindavana with Om Sri Raghavendraya Namaha in Sanskrit', fakeAsync(() => {
    start(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.om')!.textContent).toBe('ॐ श्री राघवेन्द्राय नमः');
    expect(el.querySelector('.darshan')!.getAttribute('aria-label')).toContain('Raghavendra');
    fixture.destroy();
  }));

  it('plays, fades with a blur, then tells the app once', fakeAsync(() => {
    start(false);
    tick(DARSHAN_MS - 1);
    expect(darshan.leaving()).toBeFalse();
    tick(1);
    expect(darshan.leaving()).toBeTrue();
    expect(done).toBe(0);
    tick(DARSHAN_FADE_MS);
    expect(done).toBe(1);
  }));

  it('a tap skips straight to the fade', fakeAsync(() => {
    start(false);
    tick(500);
    (fixture.nativeElement.querySelector('.darshan') as HTMLElement).click();
    tick(DARSHAN_FADE_MS);
    expect(done).toBe(1);
    tick(DARSHAN_MS);
    expect(done).toBe(1);
  }));

  it('with Remove animations on, shows the photo still for a moment', fakeAsync(() => {
    start(true);
    tick(DARSHAN_STILL_MS);
    expect(done).toBe(1);
  }));
});
