import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../../src/main/shared/index.js';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function expectStrictlyIncreasing(ids: readonly string[]): void {
  for (let index = 1; index < ids.length; index += 1) {
    expect(ids[index] > ids[index - 1]).toBe(true);
  }
}

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

  it('is strictly increasing for 1000 identifiers within one millisecond', () => {
    const base = 1_700_000_000_000;
    const ids = Array.from({ length: 1_000 }, () => uuidv7(base));

    expectStrictlyIncreasing(ids);
    expect(new Set(ids).size).toBe(1_000);
  });

  it('keeps strictly increasing order when the 12-bit counter overflows', () => {
    const base = 1_700_100_000_000;
    const ids = Array.from({ length: 5_000 }, () => uuidv7(base));

    expectStrictlyIncreasing(ids);
    expect(new Set(ids).size).toBe(5_000);
  });

  it('keeps increasing order when the system clock steps backwards', () => {
    const base = 1_700_200_000_000;
    const first = uuidv7(base + 5);
    const second = uuidv7(base);

    expect(second > first).toBe(true);
  });

  it('rejects timestamps outside the 48-bit range', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
  });
});
