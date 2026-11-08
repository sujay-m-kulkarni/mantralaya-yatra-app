import { addDays, clampDay, dayNumber, istDay, nowIst } from './dates';
import { formatInr, paiseToInput, parseRupees } from './money';

describe('money', () => {
  it('formats paise as rupees with Indian grouping', () => {
    expect(formatInr(100100)).toBe('₹1,001');
    expect(formatInr(1_00_00_000)).toBe('₹1,00,000');
    expect(formatInr(25050)).toBe('₹250.5');
    expect(formatInr(0)).toBe('₹0');
  });

  it('reads what a volunteer types', () => {
    expect(parseRupees('1001')).toBe(100100);
    expect(parseRupees(' ₹1,001 ')).toBe(100100);
    expect(parseRupees('250.5')).toBe(25050);
    expect(parseRupees('250.05')).toBe(25005);
  });

  it('refuses amounts the server would refuse', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', '1000000001']) {
      expect(parseRupees(bad)).withContext(bad).toBeNull();
    }
  });

  it('round-trips through an input box', () => {
    expect(paiseToInput(100100)).toBe('1001');
    expect(paiseToInput(25050)).toBe('250.50');
    expect(paiseToInput(null)).toBe('');
    expect(parseRupees(paiseToInput(25005))).toBe(25005);
  });
});

describe('dates', () => {
  it('puts late-night payments on the Indian day', () => {
    expect(istDay('2026-12-04T18:00:00Z')).toBe('2026-12-04'); // 23:30 IST
    expect(istDay('2026-12-04T19:00:00Z')).toBe('2026-12-05'); // 00:30 IST next day
    expect(istDay('2026-12-05T00:30:00+05:30')).toBe('2026-12-05');
  });

  it('stamps entries with the IST offset', () => {
    expect(nowIst(new Date('2026-12-01T03:30:00Z'))).toBe('2026-12-01T09:00:00.000+05:30');
  });

  it('numbers yatra days from 1 and clamps to the dates', () => {
    expect(dayNumber('2026-12-04', '2026-12-01', '2026-12-08')).toBe(4);
    expect(dayNumber('2026-12-09', '2026-12-01', '2026-12-08')).toBeNull();
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(clampDay('2026-11-07', '2026-12-01', '2026-12-08')).toBe('2026-12-01');
  });
});
