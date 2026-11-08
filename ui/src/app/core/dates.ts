/** India has no daylight saving: a fixed +05:30 decides which day something happened on. */
export const IST_OFFSET_MINUTES = 330;

/** The IST calendar day (yyyy-MM-dd) of a moment. */
export function istDay(moment: Date | string): string {
  const ms = (typeof moment === 'string' ? new Date(moment) : moment).getTime();
  return new Date(ms + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Now as ISO 8601 with the IST offset, e.g. 2026-12-01T09:15:00.000+05:30. Sent as recordedAt. */
export function nowIst(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString();
  return `${shifted.slice(0, 23)}+05:30`;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day 1 is the start date; null outside the yatra. */
export function dayNumber(day: string, startsOn: string, endsOn: string): number | null {
  if (day < startsOn || day > endsOn) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1;
}

const LONG = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Sat, 7 Nov 2026" */
export function formatDay(day: string): string {
  return LONG.format(new Date(`${day}T00:00:00Z`));
}

/** Keeps a day inside the yatra's dates. */
export function clampDay(day: string, startsOn: string, endsOn: string): string {
  return day < startsOn ? startsOn : day > endsOn ? endsOn : day;
}
