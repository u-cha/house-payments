import { randomBytes } from 'node:crypto';

const MAX_TIMESTAMP_MS = 2 ** 48 - 1;

// UUIDv7 (RFC 9562): 48 старших бит — миллисекунды, поэтому строки сортируются по времени (core-modules §8).
export function uuidv7(nowMs: number = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_TIMESTAMP_MS) {
    throw new RangeError('uuidv7 timestamp must be a non-negative 48-bit integer');
  }
  const bytes = randomBytes(16);
  let timestamp = nowMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
