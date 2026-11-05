import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toAppError } from '../../src/main/shared/index.js';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UNEXPECTED_MESSAGE = 'Внутренняя ошибка приложения';

function systemError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

function safeMessageOf(message: string): string {
  return new AppError({ code: 'VALIDATION_FAILED', message }).message;
}

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
    expect(error.traceId).toMatch(UUID_V7_RE);
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

describe('safeMessage', () => {
  it('redacts absolute unix paths', () => {
    const message = safeMessageOf('cannot open /Users/alice/house-payments.hpd');
    expect(message).not.toContain('/Users/alice');
    expect(message).toContain('[path]');
  });

  it('redacts windows paths and file urls', () => {
    const message = safeMessageOf(
      'Не удалось прочитать C:\\Users\\alice\\AppData\\house.hpd и file:///home/alice/db.hpd',
    );
    expect(message).not.toContain('alice');
    expect(message.match(/\[path\]/g)).toHaveLength(2);
  });

  it('redacts e-mail addresses', () => {
    const message = safeMessageOf('Письмо для alice.cooper@example.com не отправлено');
    expect(message).not.toContain('alice.cooper@example.com');
    expect(message).toContain('[email]');
  });

  it('redacts phone numbers', () => {
    const message = safeMessageOf('Позвонить +7 (916) 123-45-67 или 8-916-765-43-21');
    expect(message).not.toContain('123-45-67');
    expect(message).not.toContain('765-43-21');
    expect(message.match(/\[phone\]/g)).toHaveLength(2);
  });

  it('redacts bearer tokens and api keys', () => {
    const message = safeMessageOf(
      'Authorization: Bearer abcdef1234567890 key=sk-live-abcdef1234567890',
    );
    expect(message).not.toContain('abcdef1234567890');
    expect(message).not.toContain('sk-live-abcdef1234567890');
    expect(message.match(/\[token\]/g)).toHaveLength(2);
  });

  it('redacts long opaque secrets such as sha256 hashes', () => {
    const secret = 'a'.repeat(40);
    const message = safeMessageOf(`token=${secret}`);
    expect(message).not.toContain(secret);
    expect(message).toContain('[token]');
  });

  it('keeps ordinary user-facing text untouched', () => {
    const text = 'Сумма 12 345,67 ₽ превышает остаток по квитанции';
    expect(safeMessageOf(text)).toBe(text);
  });

  it('limits the message length', () => {
    const message = safeMessageOf('а'.repeat(1_000));
    expect(message).toHaveLength(500);
  });
});

describe('toAppError', () => {
  it('passes an existing AppError through unchanged', () => {
    const original = new AppError({ code: 'BUSINESS_RULE', message: 'Нарушен инвариант' });
    expect(toAppError(original)).toBe(original);
  });

  it('maps file-system errno failures to retryable STORAGE_FAILURE', () => {
    const wrapped = toAppError(
      systemError('cannot open /Users/alice/house-payments.hpd', 'ENOENT'),
      'trace-storage',
    );

    expect(wrapped.code).toBe('STORAGE_FAILURE');
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.traceId).toBe('trace-storage');
    expect(wrapped.message).not.toContain('/Users/alice');
    expect(wrapped.message).toContain('[path]');
  });

  it('maps SQLite busy and io errors to retryable STORAGE_FAILURE', () => {
    const busy = toAppError(systemError('database is locked', 'SQLITE_BUSY'));
    const io = toAppError(systemError('disk I/O error', 'SQLITE_IOERR_WRITE'));

    expect(busy.code).toBe('STORAGE_FAILURE');
    expect(busy.retryable).toBe(true);
    expect(io.code).toBe('STORAGE_FAILURE');
    expect(io.retryable).toBe(true);
  });

  it('does not mark programming errors as retryable', () => {
    const wrapped = toAppError(new TypeError('Cannot read properties of undefined'));

    expect(wrapped.code).toBe('BUSINESS_RULE');
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).toBe(UNEXPECTED_MESSAGE);
  });

  it('treats a generic Error without a storage code as a non-retryable failure', () => {
    const wrapped = toAppError(new Error('unexpected invariant violation'));

    expect(wrapped.code).toBe('BUSINESS_RULE');
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).toBe(UNEXPECTED_MESSAGE);
  });

  it('does not leak the raw text of unknown errors to the user', () => {
    const wrapped = toAppError(new Error('failed for alice.cooper@example.com'));

    expect(wrapped.message).toBe(UNEXPECTED_MESSAGE);
    expect(wrapped.message).not.toContain('alice.cooper@example.com');
  });

  it('sanitises thrown non-Error values', () => {
    const wrapped = toAppError('alice.cooper@example.com');

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.code).toBe('BUSINESS_RULE');
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).toBe(UNEXPECTED_MESSAGE);
  });

  it('generates a UUIDv7 traceId for unknown errors', () => {
    const wrapped = toAppError(new RangeError('boom'));
    expect(wrapped.traceId).toMatch(UUID_V7_RE);
  });
});
