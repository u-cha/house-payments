import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../../src/main/shared/index.js';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('has the RFC 9562 version 7 and variant bits', () => {
    expect(uuidv7()).toMatch(UUID_V7_RE);
    expect(uuidv7(0)).toMatch(UUID_V7_RE);
  });

  it('sorts lexicographically in timestamp order', () => {
    const base = 1_700_000_000_000;
    const ids = Array.from({ length: 50 }, (_, index) => uuidv7(base + index));
    const shuffled = [...ids].reverse();
    expect([...shuffled].sort()).toEqual(ids);
  });

  it('produces unique identifiers for the same millisecond', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(100);
  });

  it('rejects timestamps outside the 48-bit range', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
  });
});
