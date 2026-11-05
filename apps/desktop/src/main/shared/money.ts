import { AppError } from './errors.js';

// Деньги — только целые копейки в bigint (C-02, ADR-0002); арифметика внутри одной валюты.
export type Currency = 'RUB';
export const RUB: Currency = 'RUB';

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export function money(amountMinor: bigint, currency: Currency = RUB): Money {
  if (typeof amountMinor !== 'bigint') {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Money amount must be an integer number of minor units',
    });
  }
  return { amountMinor, currency };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new AppError({ code: 'VALIDATION_FAILED', message: 'Currency mismatch' });
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}
export function equalsMoney(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}
