import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { PathParams } from '../core/defineApi';
import { QueryManager } from '../core/QueryManager';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiRequestConfig } from '../core/types';
import { resolveEndpoint, type UrlInput } from './resolveEndpoint';

export interface UseSuspenseGetOptions
  extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> {
  pathParams?: PathParams;
  client?: SmartApiClient;
}

export interface UseSuspenseGetState<T> {
  /** Always defined — Suspense guarantees data is ready. */
  data: T;
  queryKey: string;
  /** Clears the suspense cache entry and re-suspends on the next render. */
  refetch: () => void;
}

type CacheEntry =
  | { status: 'pending'; promise: Promise<unknown> }
  | { status: 'success'; data: unknown }
  | { status: 'error'; error: unknown };

const suspenseCache = new Map<string, CacheEntry>();

/**
 * Suspense-friendly GET hook. Wrap the tree in `<Suspense>` + an error boundary:
 *
 *   const { data } = useSuspenseGet<User[]>('/users');
 *   // data is always defined here
 *
 * Requires React 18+.
 */
export function useSuspenseGet<T = any>(
  urlOrEndpoint: UrlInput,
  options: UseSuspenseGetOptions = {}
): UseSuspenseGetState<T> {
  const { pathParams, client, params, ...requestConfig } = options;
  const { url } = resolveEndpoint(urlOrEndpoint, { pathParams, method: 'GET' });
  const [, bump] = useState(0);

  if (!url) {
    throw new Error('useSuspenseGet requires a URL or defineApi endpoint');
  }

  const queryKey = QueryManager.keyFrom({ method: 'GET', url, params });
  let entry = suspenseCache.get(queryKey);

  if (!entry) {
    const apiClient = client ?? getDefaultApi();
    const promise = apiClient
      .request<T>({
        ...requestConfig,
        params,
        url,
        method: 'GET',
      })
      .then((response) => {
        suspenseCache.set(queryKey, { status: 'success', data: response.data });
        apiClient.queries.remember(queryKey, response.data);
      })
      .catch((error) => {
        suspenseCache.set(queryKey, { status: 'error', error });
      });

    entry = { status: 'pending', promise };
    suspenseCache.set(queryKey, entry);
  }

  if (entry.status === 'pending') {
    throw entry.promise;
  }
  if (entry.status === 'error') {
    throw entry.error;
  }

  const refetch = useCallback(() => {
    suspenseCache.delete(queryKey);
    bump((n) => n + 1);
  }, [queryKey]);

  return {
    data: entry.data as T,
    queryKey,
    refetch,
  };
}

/** Clear one or all Suspense cache entries (useful in tests / logout). */
export function clearSuspenseCache(queryKey?: string): void {
  if (!queryKey) {
    suspenseCache.clear();
    return;
  }
  suspenseCache.delete(queryKey);
}
