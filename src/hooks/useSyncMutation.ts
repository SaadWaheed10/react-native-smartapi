import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { PathParams } from '../core/defineApi';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { ConflictStrategy } from '../core/types';
import type { HttpMethod, SmartApiError, SmartApiRequestConfig } from '../core/types';
import {
  useMutation,
  type OptimisticUpdateConfig,
  type UseMutationOptions,
} from './useMutation';
import { resolveEndpoint, type UrlInput } from './resolveEndpoint';

export interface UseSyncMutationOptions
  extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> {
  method?: Extract<HttpMethod, 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  client?: SmartApiClient;
  pathParams?: PathParams;
  invalidateKeys?: string[];
  optimisticUpdate?: OptimisticUpdateConfig;
  /**
   * Conflict strategy when the server returns 409 during sync/flush.
   * Overrides the global `offline.onConflict` for this mutation.
   */
  onConflict?: ConflictStrategy;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
  onQueued?: () => void;
  onConflictResolved?: (result: 'server-wins' | 'client-wins' | 'merged' | 'skipped') => void;
}

export interface UseSyncMutationState<T> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  queued: boolean;
  conflict: boolean;
  mutate: (data?: any, overrideUrl?: string) => Promise<T | undefined>;
  /** Force-flush the offline queue (after reconnect). */
  sync: () => Promise<void>;
  reset: () => void;
}

/**
 * One mutation helper for online optimistic, offline queue, and reconnect conflicts:
 *
 *   const { mutate, queued, conflict, sync } = useSyncMutation('/todos', {
 *     method: 'POST',
 *     optimisticUpdate: { key: '/todos', update: (old, v) => [...(old??[]), v] },
 *     onConflict: 'client-wins',
 *     invalidateKeys: ['/todos'],
 *   });
 */
export function useSyncMutation<T = any>(
  urlOrEndpoint: UrlInput,
  options: UseSyncMutationOptions = {}
): UseSyncMutationState<T> {
  const {
    onConflict,
    onConflictResolved,
    client,
    ...mutationOptions
  } = options;

  const base = useMutation<T>(urlOrEndpoint, {
    ...mutationOptions,
    client,
    onQueued: () => {
      mutationOptions.onQueued?.();
    },
  } as UseMutationOptions);

  const [conflict, setConflict] = useState(false);

  const mutate = useCallback(
    async (data?: any, overrideUrl?: string) => {
      setConflict(false);
      const apiClient = client ?? getDefaultApi();
      const { url, method } = resolveEndpoint(urlOrEndpoint, {
        pathParams: options.pathParams,
        method: options.method ?? 'POST',
      });

      try {
        return await base.mutate(data, overrideUrl);
      } catch (err) {
        const smartError = err as SmartApiError;
        if (smartError.status === 409 || smartError.code === 'HTTP_409') {
          setConflict(true);
          const strategy =
            onConflict ?? apiClient.getConfig().offline?.onConflict ?? 'server-wins';
          const resolved = await resolveConflict(
            apiClient,
            strategy,
            {
              url: overrideUrl ?? url!,
              method: method as any,
              data,
              ...mutationOptions,
            },
            smartError
          );
          onConflictResolved?.(resolved.outcome);
          if (resolved.data !== undefined) {
            return resolved.data as T;
          }
        }
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base.mutate, client, urlOrEndpoint, onConflict]
  );

  const sync = useCallback(async () => {
    const apiClient = client ?? getDefaultApi();
    await apiClient.offline.flush();
  }, [client]);

  return {
    data: base.data,
    loading: base.loading,
    error: base.error,
    queued: base.queued,
    conflict,
    mutate,
    sync,
    reset: () => {
      setConflict(false);
      base.reset();
    },
  };
}

async function resolveConflict(
  client: SmartApiClient,
  strategy: ConflictStrategy,
  config: SmartApiRequestConfig,
  error: SmartApiError
): Promise<{ outcome: 'server-wins' | 'client-wins' | 'merged' | 'skipped'; data?: any }> {
  if (typeof strategy === 'function') {
    const result = await strategy({ config, error, server: error.details });
    return { outcome: 'merged', data: result };
  }

  if (strategy === 'ask') {
    return { outcome: 'skipped' };
  }

  if (strategy === 'client-wins') {
    // Retry once with a conflict override header.
    const response = await client.request({
      ...config,
      headers: { ...config.headers, 'X-Conflict-Resolve': 'client' },
    });
    return { outcome: 'client-wins', data: response.data };
  }

  // server-wins — keep server state, optionally refetch
  return { outcome: 'server-wins', data: error.details };
}
