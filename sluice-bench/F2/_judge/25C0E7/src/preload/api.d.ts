import type { StarChartApi } from '../shared/contracts/ipc';

declare global {
  interface Window {
    starChart: StarChartApi;
  }
}

export {};
