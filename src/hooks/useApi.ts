import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getDefaultApi } from '../core/config';
import { QueryManager } from '../core/QueryManager';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseApiOptions extends Omit<SmartApiRequestConfig, 'url'> {
  /** Skip the initial automatic fetch (e.g. to trigger it manually via `refetch`). Default: false. */
  skip?: boolean;
  /** Alias for `!skip` — set to false to disable the query. */
  enabled?: boolean;
  /** Poll the endpoint every N milliseconds. */
  pollInterval?: number;
  /**
   * Consider cached hook data fresh for this many ms. While fresh, remount/focus
   * will not refetch. Default: client `staleTime` or 0.
   */
  staleTime?: number;
  /** Refetch when the app returns to the foreground. Default: false. */
  refetchOnFocus?: boolean;
  /** Deduplicate concurrent identical requests. Default: true. */
  dedupe?: boolean;
  /** Custom client instance. Defaults to the shared configured client. */
  client?: SmartApiClient;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
}

export interface UseApiState<T> {
  data: T | undefined;
  loading: boolean;
  /** True whenever a request is in flight (including background refetch). */
  isFetching: boolean;
  error: SmartApiError | undefined;
  success: boolean;
  refetch: () => Promise<void>;
  fromCache: boolean;
  /** Stable query key for this hook instance. */
  queryKey: string;
}

/**
 * Generic data-fetching hook used internally by useGet/usePost/etc, and
 * usable directly for full control:
 *
 *   const { data, loading, error, refetch } = useApi('/users', {
 *     params: { page: 1 },
 *     staleTime: 30_000,
 *     refetchOnFocus: true,
 *   });
 */
export function useApi<T = any>(url: string | null, options: UseApiOptions = {}): UseApiState<T> {
  const {
    skip = false,
    enabled,
    pollInterval,
    staleTime,
    refetchOnFocus = false,
    dedupe = true,
    client,
    onSuccess,
    onError,
    method = 'GET',
    params,
    ...requestConfig
  } = options;

  const isEnabled = enabled !== undefined ? enabled : !skip;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(isEnabled && !!url);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [fromCache, setFromCache] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const fetchedAtRef = useRef(0);
  const hasDataRef = useRef(false);
  const optionsRef = useRef({ ...requestConfig, params });
  optionsRef.current = { ...requestConfig, params };

  const paramsKey = stableSerialize(params);
  const queryKey = url
    ? QueryManager.keyFrom({ method, url, params })
    : '';

  const resolveStaleTime = useCallback(() => {
    if (staleTime !== undefined) return staleTime;
    const apiClient = client ?? getDefaultApi();
    return apiClient.getConfig().staleTime ?? 0;
  }, [staleTime, client]);

  const isFresh = useCallback(() => {
    const st = resolveStaleTime();
    if (st <= 0 || !hasDataRef.current) return false;
    return Date.now() - fetchedAtRef.current < st;
  }, [resolveStaleTime]);

  const fetchData = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!url) return;
      if (!opts?.force && isFresh()) return;

      const apiClient = client ?? getDefaultApi();

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const showInitialLoading = !hasDataRef.current;
      if (showInitialLoading) setLoading(true);
      setIsFetching(true);
      setError(undefined);

      const run = () =>
        apiClient.request<T>({
          ...optionsRef.current,
          url,
          method,
          signal: controller.signal,
        });

      try {
        const response = dedupe
          ? await apiClient.queries.dedupe(queryKey, run)
          : await run();

        if (!isMountedRef.current) return;
        setData(response.data);
        setFromCache(!!response.fromCache);
        fetchedAtRef.current = Date.now();
        hasDataRef.current = true;
        onSuccess?.(response.data);
      } catch (err) {
        if (!isMountedRef.current) return;
        const smartError = err as SmartApiError;
        if (smartError.type !== 'CANCELLED') {
          setError(smartError);
          onError?.(smartError);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setIsFetching(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, method, client, queryKey, paramsKey, dedupe, isFresh]
  );

  const refetch = useCallback(async () => {
    await fetchData({ force: true });
  }, [fetchData]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isEnabled && url) {
      void fetchData();
    }
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [fetchData, isEnabled, url]);

  useEffect(() => {
    if (!pollInterval || !isEnabled || !url) return undefined;
    const interval = setInterval(() => void fetchData({ force: true }), pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, isEnabled, url, fetchData]);

  // Refetch on app foreground.
  useEffect(() => {
    if (!refetchOnFocus || !isEnabled || !url) return undefined;

    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && !isFresh()) {
        void fetchData();
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => {
      if (typeof (sub as { remove?: () => void })?.remove === 'function') {
        sub.remove();
      } else {
        // RN 0.65–0.70
        (AppState as any).removeEventListener?.('change', onChange);
      }
    };
  }, [refetchOnFocus, isEnabled, url, fetchData, isFresh]);

  // Refetch when matching queries are invalidated.
  useEffect(() => {
    if (!url || !isEnabled) return undefined;
    const apiClient = client ?? getDefaultApi();
    return apiClient.queries.subscribe((event) => {
      if (QueryManager.matches(queryKey, event) || QueryManager.matches(url, event)) {
        void fetchData({ force: true });
      }
    });
  }, [url, isEnabled, client, queryKey, fetchData]);

  return {
    data,
    loading,
    isFetching,
    error,
    success: !loading && !error && data !== undefined,
    refetch,
    fromCache,
    queryKey,
  };
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
