import { useApi } from './useApi';
import type { UseApiOptions, UseApiState } from './useApi';
import type { UrlInput } from './resolveEndpoint';

/** Thin convenience wrapper around `useApi` fixed to GET. */
export function useGet<T = any>(
  urlOrEndpoint: UrlInput,
  options: Omit<UseApiOptions, 'method' | 'data'> = {}
): UseApiState<T> {
  return useApi<T>(urlOrEndpoint, { ...options, method: 'GET' });
}
