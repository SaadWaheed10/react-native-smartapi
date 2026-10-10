import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { HttpMethod, SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseMutationOptions extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> {
  method?: Extract<HttpMethod, 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  client?: SmartApiClient;
  /** After success, invalidate matching query keys/prefixes so hooks refetch. */
  invalidateKeys?: string[];
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
 *   });
 *   await mutate({ name: 'Ada' });
 */
export function useMutation<T = any>(
  url: string,
  options: UseMutationOptions = {}
): UseMutationState<T> {
  const {
    method = 'POST',
    client,
    invalidateKeys,
    onSuccess,
    onError,
    onQueued,
    ...requestConfig
  } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [queued, setQueued] = useState(false);

  const mutate = useCallback(
    async (mutationData?: any, overrideUrl?: string): Promise<T | undefined> => {
      const apiClient = client ?? getDefaultApi();
      setLoading(true);
      setError(undefined);
      setQueued(false);

      try {
        const response = await apiClient.request<T>({
          ...requestConfig,
          url: overrideUrl ?? url,
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
