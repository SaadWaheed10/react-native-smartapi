import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { HttpMethod, SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseMutationOptions extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> {
  method?: Extract<HttpMethod, 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  client?: SmartApiClient;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
}

export interface UseMutationState<T> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  /** Imperatively trigger the mutation. Returns the response data, or throws on failure. */
  mutate: (data?: any, overrideUrl?: string) => Promise<T>;
  reset: () => void;
}

/**
 * Imperative hook for creating/updating/deleting data:
 *
 *   const { mutate, loading, error } = useMutation('/users', { method: 'POST' });
 *   await mutate({ name: 'Ada' });
 */
export function useMutation<T = any>(
  url: string,
  options: UseMutationOptions = {}
): UseMutationState<T> {
  const { method = 'POST', client, onSuccess, onError, ...requestConfig } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);

  const mutate = useCallback(
    async (mutationData?: any, overrideUrl?: string): Promise<T> => {
      const apiClient = client ?? getDefaultApi();
      setLoading(true);
      setError(undefined);

      try {
        const response = await apiClient.request<T>({
          ...requestConfig,
          url: overrideUrl ?? url,
          method,
          data: mutationData,
        });
        setData(response.data);
        onSuccess?.(response.data);
        return response.data;
      } catch (err) {
        const smartError = err as SmartApiError;
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
  }, []);

  return { data, loading, error, mutate, reset };
}
