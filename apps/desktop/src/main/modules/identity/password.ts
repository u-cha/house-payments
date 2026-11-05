import { hash, verify } from '@node-rs/argon2';

/**
 * Пароль хранится только Argon2id-хешем (ADR-0006, QS-05, INV-16).
 *
 * Библиотека: `@node-rs/argon2` — обёртка над Rust-крейтом argon2 через N-API.
 * Выбор: готовые бинарники под macOS/Windows/Linux (без node-gyp и rebuild под
 * Electron), стабильный ABI N-API и стандартная PHC-кодировка `$argon2id$v=19$…`,
 * совместимая с другими реализациями Argon2. Параметры — минимум OWASP
 * (19 MiB, t=2, p=1): стойкость при входе в локальное приложение.
 */
export const ARGON2ID_PARAMS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_PARAMS);
}

/** Битый/чужой хеш трактуется как неверный пароль, без деталей наружу. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
