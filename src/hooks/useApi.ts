import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseApiOptions extends Omit<SmartApiRequestConfig, 'url'> {
  /** Skip the initial automatic fetch (e.g. to trigger it manually via `refetch`). Default: false. */
  skip?: boolean;
  /** Poll the endpoint every N milliseconds. */
  pollInterval?: number;
  /** Custom client instance. Defaults to the shared configured client. */
  client?: SmartApiClient;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
}

export interface UseApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  success: boolean;
  refetch: () => Promise<void>;
  fromCache: boolean;
}

/**
 * Generic data-fetching hook used internally by useGet/usePost/etc, and
 * usable directly for full control:
 *
 *   const { data, loading, error, refetch } = useApi('/users');
 */
export function useApi<T = any>(url: string | null, options: UseApiOptions = {}): UseApiState<T> {
  const {
    skip = false,
    pollInterval,
    client,
    onSuccess,
    onError,
    method = 'GET',
    ...requestConfig
  } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(!skip && !!url);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [fromCache, setFromCache] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const optionsRef = useRef(requestConfig);
  optionsRef.current = requestConfig;

  const fetchData = useCallback(async () => {
    if (!url) return;
    const apiClient = client ?? getDefaultApi();

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(undefined);

    try {
      const response = await apiClient.request<T>({
        ...optionsRef.current,
        url,
        method,
        signal: controller.signal,
      });

      if (!isMountedRef.current) return;
      setData(response.data);
      setFromCache(!!response.fromCache);
      onSuccess?.(response.data);
    } catch (err) {
      if (!isMountedRef.current) return;
      const smartError = err as SmartApiError;
      if (smartError.type !== 'CANCELLED') {
        setError(smartError);
        onError?.(smartError);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, method, client]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!skip && url) {
      void fetchData();
    }
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, skip]);

  useEffect(() => {
    if (!pollInterval || skip || !url) return undefined;
    const interval = setInterval(() => void fetchData(), pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, skip, url, fetchData]);

  return {
    data,
    loading,
    error,
    success: !loading && !error && data !== undefined,
    refetch: fetchData,
    fromCache,
  };
}
