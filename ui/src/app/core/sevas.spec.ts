import { SevaType } from './models';
import { GOTRAS, NAKSHATRAS, RASHIS } from './sankalpa-lists';
import { keptUntil, mostUsedSevas, sevaProblem, suggestCode } from './sevas';

const seva = (code: string): SevaType => ({ id: code, code, name: code, ratePaise: 100100, dailyLimit: null, requiresSankalpa: true, isActive: true, sortOrder: 1 });

describe('Seva rules', () => {
  it('suggests a short code from the name, avoiding codes in use', () => {
    expect(suggestCode('Sarva Seva', [])).toBe('SS');
    expect(suggestCode('Sarva Samarpana Seva', [])).toBe('SSS');
    expect(suggestCode('Ashtottara', [])).toBe('ASH');
    expect(suggestCode('Sarva Seva', ['SS'])).toBe('SSA');
    expect(suggestCode('', [])).toBe('');
  });

  it('needs a name, a valid unused code and a price', () => {
    const ok = { code: 'AST', name: 'Ashtottara', ratePaise: 25100, dailyLimit: null };
    expect(sevaProblem(ok, [], true)).toBeNull();
    expect(sevaProblem({ ...ok, name: ' ' }, [], true)).toContain('name');
    expect(sevaProblem({ ...ok, code: 'ast' }, [], true)).toContain('capital letters');
    expect(sevaProblem(ok, [seva('AST')], true)).toContain('already used');
    expect(sevaProblem(ok, [seva('AST')], false)).toBeNull();
    expect(sevaProblem({ ...ok, ratePaise: null }, [], true)).toContain('price');
    expect(sevaProblem({ ...ok, dailyLimit: 0 }, [], true)).toContain('daily limit');
  });
});

describe('Most used sevas', () => {
  it('picks the four booked most often, then by the accountant\'s order, skipping sevas without a price or hidden', () => {
    const types = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].map((c, i) => ({ ...seva(c), sortOrder: i + 1 }));
    types[4] = { ...types[4], ratePaise: null };
    types[5] = { ...types[5], isActive: false };
    const bookings = [{ sevaCode: 'DD' }, { sevaCode: 'DD' }, { sevaCode: 'CC' }, { sevaCode: 'EE' }, { sevaCode: 'FF' }];
    expect(mostUsedSevas(types, bookings).map((t) => t.code)).toEqual(['DD', 'CC', 'AA', 'BB']);
    expect(mostUsedSevas(types, []).map((t) => t.code)).toEqual(['AA', 'BB', 'CC', 'DD']);
  });
});

describe('Deleted sevas', () => {
  it('are kept 60 days, keep their code taken, and leave the quick tiles', () => {
    const gone = { ...seva('HST'), deletedAt: '2026-11-08T12:00:00Z', isActive: false };
    expect(keptUntil(gone)).toBe('2027-01-07');
    expect(keptUntil(seva('SRV'))).toBeNull();
    expect(sevaProblem({ code: 'HST', name: 'New', ratePaise: 100, dailyLimit: null }, [gone], true)).toContain('deleted seva');
    expect(mostUsedSevas([gone, seva('SRV')], [{ sevaCode: 'HST' }]).map((t) => t.code)).toEqual(['SRV']);
  });
});

describe('Sankalpa lists', () => {
  it('has all 27 nakshatras and 12 rashis, and the common gotras without repeats', () => {
    expect(NAKSHATRAS.length).toBe(27);
    expect(RASHIS.length).toBe(12);
    expect(new Set(GOTRAS).size).toBe(GOTRAS.length);
    expect(GOTRAS).toContain('Kashyapa');
  });
});
