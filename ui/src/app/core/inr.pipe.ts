import { Pipe, PipeTransform } from '@angular/core';

import { formatInr } from './money';

/** {{ 100100 | inr }} → ₹1,001 */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return paise === null || paise === undefined ? '' : formatInr(paise);
  }
}
