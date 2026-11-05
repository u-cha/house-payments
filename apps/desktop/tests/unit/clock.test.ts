import { describe, expect, it } from 'vitest';
import { FixedClock, systemClock } from '../../src/main/shared/index.js';

describe('Clock', () => {
  it('returns the injected instant from a fixed clock', () => {
    const clock = new FixedClock('2026-11-05T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });

  it('advances deterministically for tests', () => {
    const clock = new FixedClock(new Date('2026-11-05T12:00:00.000Z'));
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-11-05T12:01:30.000Z');
  });

  it('does not leak the internal date through mutation', () => {
    const clock = new FixedClock('2026-11-05T12:00:00.000Z');
    clock.now().setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });

  it('exposes a system clock close to now', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
