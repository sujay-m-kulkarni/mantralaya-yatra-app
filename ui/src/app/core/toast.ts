import { Injectable, signal } from '@angular/core';

export interface Toast {
  text: string;
  kind: 'ok';
}

/** A short message at the bottom of the screen, such as "Seva saved". Shown by the app shell. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  static readonly SHOW_MS = 2800;
  readonly current = signal<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  ok(text: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.current.set({ text, kind: 'ok' });
    this.timer = setTimeout(() => this.current.set(null), ToastService.SHOW_MS);
  }

  dismiss(): void {
    if (this.timer) clearTimeout(this.timer);
    this.current.set(null);
  }
}
