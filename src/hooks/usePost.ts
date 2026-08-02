import { useApi } from './useApi';
import type { UseApiOptions, UseApiState } from './useApi';

/**
 * Convenience wrapper around `useApi` fixed to POST. Skips the automatic
 * fetch-on-mount behavior by default (POSTs are usually triggered by user
 * action) — call `refetch()` to fire the request.
 */
export function usePost<T = any>(
  url: string | null,
  data?: any,
  options: Omit<UseApiOptions, 'method' | 'data'> = {}
): UseApiState<T> {
  return useApi<T>(url, { ...options, method: 'POST', data, skip: options.skip ?? true });
}
