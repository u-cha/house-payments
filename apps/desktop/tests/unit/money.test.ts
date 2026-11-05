import { describe, expect, it } from 'vitest';
import {
  addMoney,
  equalsMoney,
  money,
  subtractMoney,
  type Money,
} from '../../src/main/shared/index.js';

// Монеты, которых нет в типе Currency, получаем только приведением: так тест
// проверяет защиту на случай будущих валют и данных, пришедших извне.
const usd = { amountMinor: 100n, currency: 'USD' } as unknown as Money;

describe('Money', () => {
  it('stores integer minor units as bigint without float precision loss', () => {
    const amount = money(9_007_199_254_740_993n);
    expect(typeof amount.amountMinor).toBe('bigint');
    expect(amount.amountMinor).toBe(9_007_199_254_740_993n);
    expect(amount.currency).toBe('RUB');
  });

  it('adds and subtracts amounts in the same currency', () => {
    expect(addMoney(money(1_250n), money(750n)).amountMinor).toBe(2_000n);
    expect(subtractMoney(money(1_250n), money(750n)).amountMinor).toBe(500n);
    expect(subtractMoney(money(0n), money(500n)).amountMinor).toBe(-500n);
  });

  it('rejects arithmetic across different currencies', () => {
    expect(() => addMoney(money(100n), usd)).toThrow(/currenc/i);
    expect(() => subtractMoney(usd, money(100n))).toThrow(/currenc/i);
  });

  it('compares by amount and currency', () => {
    expect(equalsMoney(money(100n), money(100n))).toBe(true);
    expect(equalsMoney(money(100n), money(101n))).toBe(false);
    expect(equalsMoney(money(100n), usd)).toBe(false);
  });
});
