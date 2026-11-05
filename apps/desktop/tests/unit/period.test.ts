import { describe, expect, it } from 'vitest';
import { Period } from '../../src/main/shared/index.js';

describe('Period', () => {
  it('parses YYYY-MM and compares lexicographically', () => {
    const january = Period.parse('2026-01');
    const december = Period.parse('2025-12');

    expect(january.toString()).toBe('2026-01');
    expect(january.compare(december)).toBe(1);
    expect(december.compare(january)).toBe(-1);
    expect(january.compare(Period.parse('2026-01'))).toBe(0);
  });

  it('rejects malformed periods', () => {
    for (const invalid of ['2026-13', '2026-00', '2026-1', '26-01', '2026/01', ' 2026-01', '']) {
      expect(() => Period.parse(invalid), invalid).toThrow(RangeError);
    }
  });

  it('moves to the next month across a year boundary', () => {
    expect(Period.parse('2026-12').next().toString()).toBe('2027-01');
    expect(Period.parse('2026-01').next().toString()).toBe('2026-02');
  });

  it('moves to the previous month across a year boundary', () => {
    expect(Period.parse('2026-01').previous().toString()).toBe('2025-12');
    expect(Period.parse('2026-03').previous().toString()).toBe('2026-02');
  });

  it('sorts periods in chronological order', () => {
    const sorted = ['2026-02', '2025-12', '2026-01']
      .map((value) => Period.parse(value))
      .sort((left, right) => left.compare(right))
      .map(String);
    expect(sorted).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});
