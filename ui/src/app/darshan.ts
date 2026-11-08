// The opening darshan: the Brindavana at Mantralaya fills the screen, starts close up and blurred, and zooms out
// into focus while "ॐ श्री राघवेन्द्राय नमः" fades in; then it blurs and fades away to the app. A tap skips it.
// With the phone's "Remove animations" setting on, the photo shows still and sharp for a moment instead.

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, output, signal } from '@angular/core';

/** How long the darshan plays before the app shows. */
export const DARSHAN_MS = 4200;
/** How long it shows when the phone asks for reduced motion. */
export const DARSHAN_STILL_MS = 1500;
/** The fade at the end, also used when a tap skips it (the 600ms in the styles). */
export const DARSHAN_FADE_MS = 600;

@Component({
  selector: 'app-darshan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="darshan" [class.leaving]="leaving()" role="img" aria-label="Darshan of the Brindavana of Sri Guru Raghavendra Swamy at Mantralaya. Tap to continue." (click)="skip()">
      <img class="photo" src="darshan/brindavana.webp" alt="" decoding="async" />
      <div class="mantra">
        <span class="om">ॐ श्री राघवेन्द्राय नमः</span>
        <span class="latin">Om Sri Raghavendraya Namaha</span>
      </div>
      <span class="skip">Tap to skip</span>
    </div>
  `,
  styles: `
    .darshan { position: fixed; inset: 0; z-index: 9000; overflow: hidden; background: #2a1408; cursor: pointer; }
    .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%;
      transform-origin: 50% 40%; animation: darshan-zoom 2.8s cubic-bezier(.2, .7, .2, 1) both; will-change: transform, filter; }
    .darshan::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 40%; pointer-events: none;
      background: linear-gradient(to top, rgba(20, 8, 2, .78), rgba(20, 8, 2, 0)); }
    .mantra { position: absolute; z-index: 1; left: 0; right: 0; bottom: calc(14% + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column;
      align-items: center; gap: 4px; color: #fff; text-align: center; text-shadow: 0 2px 10px rgba(0, 0, 0, .6);
      opacity: 0; animation: darshan-rise .9s 1.5s ease-out forwards; }
    .om { font-family: "Noto Serif Devanagari", "Noto Sans Devanagari", serif; font-size: 28px; font-weight: 700; }
    .latin { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; opacity: .9; }
    .skip { position: absolute; right: 14px; top: calc(14px + env(safe-area-inset-top, 0px)); font-size: 12px; color: #fff;
      background: rgba(0, 0, 0, .3); padding: 4px 12px; border-radius: 99px; opacity: .8; }
    .leaving { animation: darshan-leave 600ms ease-in forwards; }
    @keyframes darshan-zoom {
      from { transform: scale(1.9); filter: blur(14px) brightness(1.15); }
      60% { filter: blur(3px); }
      to { transform: scale(1); filter: blur(0); }
    }
    @keyframes darshan-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @keyframes darshan-leave { to { opacity: 0; filter: blur(10px); } }
    @media (prefers-reduced-motion: reduce) {
      .photo, .mantra, .leaving { animation: none; }
      .mantra { opacity: 1; }
      .leaving { opacity: 0; }
    }
  `,
})
export class Darshan implements OnInit, OnDestroy {
  /** Fires once, when the darshan has finished or been skipped. */
  readonly done = output<void>();
  readonly leaving = signal(false);

  /** Replaced in tests. */
  reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private finished = false;

  ngOnInit(): void {
    const still = this.reducedMotion();
    const showFor = still ? DARSHAN_STILL_MS : DARSHAN_MS;
    this.timers.push(setTimeout(() => this.leave(still ? 0 : DARSHAN_FADE_MS), showFor));
  }

  /** A tap: go straight to the fade. */
  skip(): void {
    this.leave(this.reducedMotion() ? 0 : DARSHAN_FADE_MS);
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  private leave(fadeMs: number): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    this.timers.push(setTimeout(() => this.finish(), fadeMs));
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.done.emit();
  }
}
