import type { z } from 'zod';
import type { IpcResult } from '../../shared/ipc.js';
import { AppError, toAppError } from '../shared/errors.js';

const INVALID_REQUEST = 'Некорректные данные запроса';

/** Zod-валидация на границе IPC: любая ошибка формы — безопасный VALIDATION_FAILED. */
export function parseIpcInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError({ code: 'VALIDATION_FAILED', message: INVALID_REQUEST });
  return result.data;
}

/** Любая команда моста отвечает результатом или безопасной AppError (core-modules §6). */
export async function respond<T>(work: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: toAppError(error).toJSON() };
  }
}
