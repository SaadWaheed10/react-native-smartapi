import { useApi } from './useApi';
import type { UseApiOptions, UseApiState } from './useApi';

/** Thin convenience wrapper around `useApi` fixed to GET. */
export function useGet<T = any>(
  url: string | null,
  options: Omit<UseApiOptions, 'method' | 'data'> = {}
): UseApiState<T> {
  return useApi<T>(url, { ...options, method: 'GET' });
}
