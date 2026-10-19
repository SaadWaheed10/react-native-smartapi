import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getDefaultApi } from '../core/config';
import type { PathParams } from '../core/defineApi';
import { QueryManager } from '../core/QueryManager';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';
import { resolveEndpoint, type UrlInput } from './resolveEndpoint';

export type PollWhen = 'always' | 'foreground' | 'online';

export interface UseApiOptions extends Omit<SmartApiRequestConfig, 'url'> {
  /** Skip the initial automatic fetch (e.g. to trigger it manually via `refetch`). Default: false. */
  skip?: boolean;
  /** Alias for `!skip` — set to false to disable the query. */
  enabled?: boolean;
  /** Poll the endpoint every N milliseconds. */
  pollInterval?: number;
  /**
   * When polling is allowed:
   * - `always` (default): poll regardless of app state
   * - `foreground`: pause while the app is backgrounded
   * - `online`: pause while the device is offline (requires NetInfo)
   */
  pollWhen?: PollWhen;
  /**
   * Keep polling only while this predicate returns true.
   * Useful for "poll until status !== pending".
   */
  pollWhile?: (data: any | undefined) => boolean;
  /**
   * Consider cached hook data fresh for this many ms. While fresh, remount/focus
   * will not refetch. Default: client `staleTime` or 0.
   */
  staleTime?: number;
  /** Refetch when the app returns to the foreground. Default: false. */
  refetchOnFocus?: boolean;
  /** Deduplicate concurrent identical requests. Default: true. */
  dedupe?: boolean;
  /** Path params for `defineApi` endpoints with `:id` placeholders. */
  pathParams?: PathParams;
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
  /** True when the latest error was a timeout. */
  isTimeout: boolean;
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
 *   useApi('/orders', {
 *     pollInterval: 5000,
 *     pollWhen: 'foreground',
 *     pollWhile: (data) => data?.status === 'pending',
 *   });
 */
export function useApi<T = any>(
  urlOrEndpoint: UrlInput,
  options: UseApiOptions = {}
): UseApiState<T> {
  const {
    skip = false,
    enabled,
    pollInterval,
    pollWhen = 'always',
    pollWhile,
    staleTime,
    refetchOnFocus = false,
    dedupe = true,
    pathParams,
    client,
    onSuccess,
    onError,
    method: methodOption,
    params,
    ...requestConfig
  } = options;

  const { url, method } = resolveEndpoint(urlOrEndpoint, {
    pathParams,
    method: methodOption,
  });

  const isEnabled = enabled !== undefined ? enabled : !skip;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(isEnabled && !!url);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [fromCache, setFromCache] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isOnline, setIsOnline] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const fetchedAtRef = useRef(0);
  const hasDataRef = useRef(false);
  const dataRef = useRef<T | undefined>(undefined);
  const optionsRef = useRef({ ...requestConfig, params });
  optionsRef.current = { ...requestConfig, params };
  const pollWhileRef = useRef(pollWhile);
  pollWhileRef.current = pollWhile;

  const paramsKey = stableSerialize(params);
  const pathKey = stableSerialize(pathParams);
  const queryKey = url ? QueryManager.keyFrom({ method, url, params }) : '';

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
        dataRef.current = response.data;
        setFromCache(!!response.fromCache);
        fetchedAtRef.current = Date.now();
        hasDataRef.current = true;
        apiClient.queries.remember(queryKey, response.data);
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
    [url, method, client, queryKey, paramsKey, pathKey, dedupe, isFresh]
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

  // Track app foreground / background for pollWhen + refetchOnFocus.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => setAppState(state);
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      if (typeof (sub as { remove?: () => void })?.remove === 'function') {
        sub.remove();
      } else {
        (AppState as any).removeEventListener?.('change', onChange);
      }
    };
  }, []);

  // Track online state when pollWhen === 'online'.
  useEffect(() => {
    if (pollWhen !== 'online') return undefined;
    const apiClient = client ?? getDefaultApi();
    void apiClient.network.isOnline().then(setIsOnline);
    return apiClient.network.onChange(setIsOnline);
  }, [pollWhen, client]);

  // Smart polling.
  useEffect(() => {
    if (!pollInterval || !isEnabled || !url) return undefined;

    const shouldPoll = () => {
      if (pollWhen === 'foreground' && appState !== 'active') return false;
      if (pollWhen === 'online' && !isOnline) return false;
      if (pollWhileRef.current && !pollWhileRef.current(dataRef.current)) return false;
      return true;
    };

    const interval = setInterval(() => {
      if (shouldPoll()) void fetchData({ force: true });
    }, pollInterval);

    return () => clearInterval(interval);
  }, [pollInterval, pollWhen, isEnabled, url, fetchData, appState, isOnline]);

  // Refetch on app foreground transition.
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
        (AppState as any).removeEventListener?.('change', onChange);
      }
    };
  }, [refetchOnFocus, isEnabled, url, fetchData, isFresh]);

  // Invalidate → refetch; setData → optimistic local update.
  useEffect(() => {
    if (!url || !isEnabled) return undefined;
    const apiClient = client ?? getDefaultApi();
    return apiClient.queries.subscribe((event) => {
      if (event.type === 'setData') {
        if (QueryManager.matchesSetData(queryKey, event)) {
          setData(event.data as T);
          dataRef.current = event.data as T;
          hasDataRef.current = true;
          fetchedAtRef.current = Date.now();
        }
        return;
      }
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
    isTimeout: !!error?.isTimeout,
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
