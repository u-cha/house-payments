import type { HousePaymentsApi } from './shared/ipc.js';

declare global {
  interface Window {
    /** Мост preload → renderer; Node-API вне этого объекта не доступен. */
    api: HousePaymentsApi;
  }
}

export {};
