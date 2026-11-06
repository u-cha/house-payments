import { QueryClient } from '@tanstack/react-query';
import { IpcError } from './api';

/**
 * Кэш чтения (TanStack Query): повторяем только retryable-ошибки AppError,
 * запись никогда не повторяется автоматически — дубль мог бы уже пройти.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        error instanceof IpcError && error.retryable && failureCount < 2,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
    mutations: {
      retry: false,
    },
  },
});
