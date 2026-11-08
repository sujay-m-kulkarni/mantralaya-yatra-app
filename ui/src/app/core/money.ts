/** ₹1 crore, the server's limit for one amount. */
export const MAX_AMOUNT_PAISE = 1_00_00_000_00;

const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** 100100 → "₹1,001"; 25050 → "₹250.5". Indian digit grouping. */
export function formatInr(paise: number): string {
  const sign = paise < 0 ? '−' : '';
  return `${sign}₹${RUPEES.format(Math.abs(paise) / 100)}`;
}

/**
 * Reads what a volunteer typed as rupees: "1001", "1,001", "1001.50", "₹ 250".
 * Returns paise, or null if it is not a positive amount the server would accept.
 */
export function parseRupees(text: string | null | undefined): number | null {
  const cleaned = (text ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return paise > 0 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

/** For an input box: 100100 → "1001", 25050 → "250.50". */
export function paiseToInput(paise: number | null): string {
  if (paise === null) return '';
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}
