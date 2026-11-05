import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toAppError } from '../../src/main/shared/index.js';

describe('AppError', () => {
  it('carries the unified error form', () => {
    const error = new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Проверьте сумму',
      details: { field: 'amount' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Проверьте сумму');
    expect(error.details).toEqual({ field: 'amount' });
    expect(error.retryable).toBe(false);
    expect(error.traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('marks storage failures as retryable', () => {
    expect(new AppError({ code: 'STORAGE_FAILURE', message: 'Ошибка диска' }).retryable).toBe(true);
  });

  it('marks concurrent modification conflicts as retryable', () => {
    const error = new AppError({
      code: 'CONFLICT',
      message: 'Запись изменена',
      details: { reason: 'CONCURRENT_MODIFICATION' },
    });
    expect(error.retryable).toBe(true);
  });

  it('keeps traceId for correlation and allows an explicit one', () => {
    const traceId = 'trace-123';
    expect(new AppError({ code: 'NOT_FOUND', message: 'Нет', traceId }).traceId).toBe(traceId);
  });

  it('recognises its own instances', () => {
    expect(isAppError(new AppError({ code: 'FORBIDDEN', message: 'Нет доступа' }))).toBe(true);
    expect(isAppError(new Error('boom'))).toBe(false);
  });

  it('wraps unknown errors into a safe AppError without file paths', () => {
    const wrapped = toAppError(new Error('cannot open /Users/alice/house-payments.hpd'));

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.code).toBe('STORAGE_FAILURE');
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.message).not.toContain('/Users/alice');
    expect(wrapped.message).toContain('[path]');
  });

  it('passes an existing AppError through unchanged', () => {
    const original = new AppError({ code: 'BUSINESS_RULE', message: 'Нарушен инвариант' });
    expect(toAppError(original)).toBe(original);
  });

  it('serialises to the IPC-safe form', () => {
    const error = new AppError({ code: 'CONFLICT', message: 'Конфликт' });
    expect(error.toJSON()).toEqual({
      code: 'CONFLICT',
      message: 'Конфликт',
      retryable: false,
      traceId: error.traceId,
    });
  });
});
