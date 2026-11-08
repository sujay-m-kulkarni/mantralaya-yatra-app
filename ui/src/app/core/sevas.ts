// Rules for the sevas the accountant creates. The server checks the same ones (SaveSevaType).

import { SevaType } from './models';

/** 2 to 5 capital letters: the receipt prefix, as in SRV-0001. */
export const SEVA_CODE = /^[A-Z]{2,5}$/;
export const MAX_SEVA_NAME = 60;
export const MAX_SEVAS = 20;

/**
 * A short code from a seva's name, not already used: "Sarva Seva" → "SS", "Ashtottara" → "ASH",
 * "Sarva Samarpana Seva" → "SSS". The accountant can change it before saving.
 */
export function suggestCode(name: string, taken: readonly string[]): string {
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const initials = words.map((w) => w[0]).join('').slice(0, 5);
  const base = initials.length >= 2 ? initials : words[0].slice(0, 3);
  if (base.length < 2) return '';
  if (!taken.includes(base)) return base;
  // Taken: lengthen with the next letters of the first word, then the last word.
  const letters = (words[0].slice(1) + words[words.length - 1].slice(1)).split('');
  let candidate = base;
  for (const letter of letters) {
    if (candidate.length >= 5) break;
    candidate += letter;
    if (!taken.includes(candidate)) return candidate;
  }
  return '';
}

/** What is wrong with a seva before it is sent, or null. */
export function sevaProblem(
  s: { code: string; name: string; ratePaise: number | null; dailyLimit: number | null },
  existing: readonly SevaType[],
  isNew: boolean,
): string | null {
  if (!s.name.trim()) return 'Enter the seva name.';
  if (s.name.trim().length > MAX_SEVA_NAME) return `Keep the name under ${MAX_SEVA_NAME} characters.`;
  if (!SEVA_CODE.test(s.code)) return 'The short code must be 2 to 5 capital letters, e.g. SRV.';
  if (isNew && existing.some((t) => t.code === s.code)) return `${s.code} is already used by another seva.`;
  if (isNew && existing.length >= MAX_SEVAS) return `A yatra can have at most ${MAX_SEVAS} sevas.`;
  if (s.ratePaise === null) return 'Enter the price in rupees, e.g. 1001.';
  if (s.dailyLimit !== null && (!Number.isInteger(s.dailyLimit) || s.dailyLimit < 1 || s.dailyLimit > 10_000)) {
    return 'The daily limit must be a whole number from 1 to 10000, or left empty.';
  }
  return null;
}

/**
 * The sevas booked most often in this yatra, for the quick tiles on the booking form: by number of bookings,
 * then the accountant's order. Only sevas that can be booked (offered, with a price).
 */
export function mostUsedSevas(types: readonly SevaType[], bookings: readonly { sevaCode: string }[], count = 4): SevaType[] {
  const uses = new Map<string, number>();
  for (const b of bookings) uses.set(b.sevaCode, (uses.get(b.sevaCode) ?? 0) + 1);
  return types
    .filter((t) => t.isActive && t.ratePaise !== null)
    .slice()
    .sort((a, b) => (uses.get(b.code) ?? 0) - (uses.get(a.code) ?? 0) || a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .slice(0, count);
}
