import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { PathParams } from '../core/defineApi';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { HttpMethod, SmartApiError, SmartApiRequestConfig } from '../core/types';
import { resolveEndpoint, type UrlInput } from './resolveEndpoint';

export interface OptimisticUpdateConfig<TQuery = any, TVars = any> {
  /**
   * Query key / URL / prefix to update (e.g. `'/todos'` or `'GET:/todos'`).
   * Active `useGet` / `useApi` hooks matching this key update immediately.
   */
  key: string;
  /** Produce the next cached value from the previous one + mutation variables. */
  update: (old: TQuery | undefined, variables: TVars) => TQuery;
  /** Restore previous data if the mutation fails. Default: true. */
  rollbackOnError?: boolean;
}

export interface UseMutationOptions extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> {
  method?: Extract<HttpMethod, 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  client?: SmartApiClient;
  /** Path params for `defineApi` endpoints with `:id` placeholders. */
  pathParams?: PathParams;
  /** After success, invalidate matching query keys/prefixes so hooks refetch. */
  invalidateKeys?: string[];
  /** Instantly update matching queries before the server responds. */
  optimisticUpdate?: OptimisticUpdateConfig;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
  onQueued?: () => void;
}

export interface UseMutationState<T> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  /** True when the last mutate() was queued offline instead of sent. */
  queued: boolean;
  /** Imperatively trigger the mutation. Returns the response data, or throws on failure. */
  mutate: (data?: any, overrideUrl?: string) => Promise<T | undefined>;
  reset: () => void;
}

/**
 * Imperative hook for creating/updating/deleting data:
 *
 *   const { mutate, loading, error, queued } = useMutation('/users', {
 *     method: 'POST',
 *     invalidateKeys: ['/users'],
 *     optimisticUpdate: {
 *       key: '/users',
 *       update: (old, vars) => [...(old ?? []), { id: 'temp', ...vars }],
 *     },
 *   });
 *   await mutate({ name: 'Ada' });
 */
export function useMutation<T = any>(
  urlOrEndpoint: UrlInput,
  options: UseMutationOptions = {}
): UseMutationState<T> {
  const {
    method: methodOption = 'POST',
    client,
    pathParams,
    invalidateKeys,
    optimisticUpdate,
    onSuccess,
    onError,
    onQueued,
    ...requestConfig
  } = options;

  const { url, method } = resolveEndpoint(urlOrEndpoint, {
    pathParams,
    method: methodOption,
  });

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [queued, setQueued] = useState(false);

  const mutate = useCallback(
    async (mutationData?: any, overrideUrl?: string): Promise<T | undefined> => {
      const apiClient = client ?? getDefaultApi();
      const requestUrl = overrideUrl ?? url;
      if (!requestUrl) {
        throw new Error('useMutation requires a URL or defineApi endpoint');
      }

      setLoading(true);
      setError(undefined);
      setQueued(false);

      let previous: any;
      let didOptimistic = false;

      if (optimisticUpdate) {
        const result = apiClient.queries.updateData(
          optimisticUpdate.key,
          (old) => optimisticUpdate.update(old, mutationData)
        );
        previous = result.previous;
        didOptimistic = true;
      }

      try {
        const response = await apiClient.request<T>({
          ...requestConfig,
          url: requestUrl,
          method,
          data: mutationData,
        });

        if (response.queued) {
          setQueued(true);
          onQueued?.();
          return undefined;
        }

        setData(response.data);
        invalidateKeys?.forEach((key) => apiClient.invalidate(key));
        onSuccess?.(response.data);
        return response.data;
      } catch (err) {
        const smartError = err as SmartApiError;
        if (smartError.code === 'REQUEST_QUEUED_OFFLINE') {
          setQueued(true);
          onQueued?.();
          return undefined;
        }

        if (
          didOptimistic &&
          optimisticUpdate &&
          optimisticUpdate.rollbackOnError !== false
        ) {
          apiClient.queries.setData(optimisticUpdate.key, previous);
        }

        setError(smartError);
        onError?.(smartError);
        throw smartError;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, method, client]
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setLoading(false);
    setQueued(false);
  }, []);

  return { data, loading, error, queued, mutate, reset };
}
