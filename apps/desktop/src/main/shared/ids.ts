import { randomBytes } from 'node:crypto';

const MAX_TIMESTAMP_MS = 2 ** 48 - 1;
const COUNTER_MAX = 0x0fff; // rand_a: 12 бит счётчика внутри миллисекунды

// Состояние монотонности: последняя использованная метка времени и счётчик rand_a.
// Модуль живёт в main-процессе Electron (один поток), поэтому состояние не требует блокировок.
let lastTimestampMs = -1;
let counter = 0;

function randomCounter(bytes: Buffer): number {
  return (((bytes[6] ?? 0) << 8) | (bytes[7] ?? 0)) & COUNTER_MAX;
}

// UUIDv7 (RFC 9562): 48 старших бит — миллисекунды, поэтому строки сортируются по времени
// (core-modules §8). Внутри одной миллисекунды rand_a используется как монотонный счётчик
// (RFC 9562 §6.2, повышенная точность времени): id одной мс строго возрастают.
//
// Гарантия: для последовательных вызовов с неубывающей меткой времени идентификаторы строго
// возрастают. Если счётчик исчерпан (4096 id за мс), метка времени сдвигается на 1 мс вперёд;
// при откате системных часов генератор продолжает от последней метки, чтобы не нарушать
// порядок. Между процессами и перезапусками непрерывность порядка не гарантируется.
export function uuidv7(nowMs: number = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_TIMESTAMP_MS) {
    throw new RangeError('uuidv7 timestamp must be a non-negative 48-bit integer');
  }

  const bytes = randomBytes(16);

  if (nowMs > lastTimestampMs) {
    lastTimestampMs = nowMs;
    counter = randomCounter(bytes);
  } else if (counter < COUNTER_MAX) {
    counter += 1;
  } else {
    if (lastTimestampMs >= MAX_TIMESTAMP_MS) {
      throw new RangeError('uuidv7 counter exhausted at the maximum timestamp');
    }
    lastTimestampMs += 1;
    counter = randomCounter(bytes);
  }

  let timestamp = lastTimestampMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7 + старшие 4 бита счётчика
  bytes[7] = counter & 0xff; // младшие 8 бит счётчика
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
