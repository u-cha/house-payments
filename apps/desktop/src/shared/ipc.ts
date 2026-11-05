// Контракт IPC-моста (core-modules §3): общая точка для main и renderer.
export const PING_CHANNEL = 'app:ping';

export interface PingResult {
  ok: true;
  version: string;
}

/** API, которое preload выставляет в window.api; Node в renderer не доступен. */
export interface HousePaymentsApi {
  ping(): Promise<PingResult>;
}
