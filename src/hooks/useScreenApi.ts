import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { HttpMethod, SmartApiError } from '../core/types';

type QueryTuple = [method: 'GET' | 'HEAD' | 'OPTIONS', url: string, options?: Record<string, any>];
type MutationTuple = [
  method: Extract<HttpMethod, 'POST' | 'PUT' | 'PATCH' | 'DELETE'>,
  url: string,
  options?: Record<string, any>
];

export type ScreenDef =
  | QueryTuple
  | MutationTuple
  | { method?: HttpMethod; url: string; options?: Record<string, any> };

export interface ScreenQuerySlice<T = any> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  refetch: () => Promise<void>;
}

export interface ScreenMutationSlice<T = any> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  queued: boolean;
  mutate: (data?: any, overrideUrl?: string) => Promise<T | undefined>;
}

type NormalizedDef = {
  key: string;
  method: HttpMethod;
  url: string;
  options: Record<string, any>;
  isMutation: boolean;
};

function normalize(key: string, def: ScreenDef): NormalizedDef {
  if (Array.isArray(def)) {
    const method = def[0].toUpperCase() as HttpMethod;
    return {
      key,
      method,
      url: def[1],
      options: (def[2] as Record<string, any>) ?? {},
      isMutation: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method),
    };
  }
  const method = (def.method ?? 'GET').toUpperCase() as HttpMethod;
  return {
    key,
    method,
    url: def.url,
    options: def.options ?? {},
    isMutation: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method),
  };
}

/**
 * Declare every API a screen needs in one place (single hook, no Rules-of-Hooks pain):
 *
 *   const screen = useScreenApi({
 *     user: ['GET', '/me'],
 *     posts: ['GET', '/posts', { staleTime: 30_000 }],
 *     create: ['POST', '/posts', { invalidateKeys: ['/posts'] }],
 *   });
 *
 *   screen.user.data
 *   await screen.create.mutate({ title: 'Hi' })
 */
export function useScreenApi<T extends Record<string, ScreenDef>>(
  defs: T,
  options: { client?: SmartApiClient; skip?: boolean } = {}
): {
  [K in keyof T]: T[K] extends MutationTuple | { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' }
    ? ScreenMutationSlice
    : ScreenQuerySlice;
} {
  const client = options.client ?? getDefaultApi();
  const normalized = useMemo(
    () => Object.keys(defs).map((key) => normalize(key, defs[key])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(Object.keys(defs).map((k) => [k, defs[k]]))]
  );

  const [queryState, setQueryState] = useState<
    Record<string, { data?: any; loading: boolean; error?: SmartApiError }>
  >(() => {
    const init: Record<string, { data?: any; loading: boolean; error?: SmartApiError }> = {};
    normalized.forEach((d) => {
      if (!d.isMutation) init[d.key] = { loading: !options.skip, data: undefined };
    });
    return init;
  });

  const [mutationState, setMutationState] = useState<
    Record<string, { data?: any; loading: boolean; error?: SmartApiError; queued: boolean }>
  >(() => {
    const init: Record<
      string,
      { data?: any; loading: boolean; error?: SmartApiError; queued: boolean }
    > = {};
    normalized.forEach((d) => {
      if (d.isMutation) init[d.key] = { loading: false, queued: false };
    });
    return init;
  });

  const fetchQuery = useCallback(
    async (def: NormalizedDef) => {
      setQueryState((prev) => ({
        ...prev,
        [def.key]: { ...prev[def.key], loading: true, error: undefined },
      }));
      try {
        const response = await client.request({
          ...def.options,
          url: def.url,
          method: def.method,
        });
        setQueryState((prev) => ({
          ...prev,
          [def.key]: { data: response.data, loading: false, error: undefined },
        }));
      } catch (err) {
        setQueryState((prev) => ({
          ...prev,
          [def.key]: {
            ...prev[def.key],
            loading: false,
            error: err as SmartApiError,
          },
        }));
      }
    },
    [client]
  );

  useEffect(() => {
    if (options.skip) return;
    normalized.forEach((def) => {
      if (!def.isMutation) void fetchQuery(def);
    });
  }, [normalized, fetchQuery, options.skip]);

  const mutateFns = useRef<Record<string, ScreenMutationSlice['mutate']>>({});

  normalized.forEach((def) => {
    if (!def.isMutation) return;
    mutateFns.current[def.key] = async (data?: any, overrideUrl?: string) => {
      setMutationState((prev) => ({
        ...prev,
        [def.key]: { ...prev[def.key], loading: true, error: undefined, queued: false },
      }));
      try {
        const response = await client.request({
          ...def.options,
          url: overrideUrl ?? def.url,
          method: def.method,
          data,
        });
        if (response.queued) {
          setMutationState((prev) => ({
            ...prev,
            [def.key]: { ...prev[def.key], loading: false, queued: true },
          }));
          return undefined;
        }
        const invalidateKeys: string[] | undefined = def.options.invalidateKeys;
        invalidateKeys?.forEach((k) => client.invalidate(k));
        setMutationState((prev) => ({
          ...prev,
          [def.key]: {
            data: response.data,
            loading: false,
            error: undefined,
            queued: false,
          },
        }));
        return response.data;
      } catch (err) {
        const smartError = err as SmartApiError;
        if (smartError.code === 'REQUEST_QUEUED_OFFLINE') {
          setMutationState((prev) => ({
            ...prev,
            [def.key]: { ...prev[def.key], loading: false, queued: true },
          }));
          return undefined;
        }
        setMutationState((prev) => ({
          ...prev,
          [def.key]: {
            ...prev[def.key],
            loading: false,
            error: smartError,
            queued: false,
          },
        }));
        throw smartError;
      }
    };
  });

  const result: Record<string, any> = {};
  normalized.forEach((def) => {
    if (def.isMutation) {
      const slice = mutationState[def.key] ?? {
        loading: false,
        queued: false,
        data: undefined,
        error: undefined,
      };
      result[def.key] = {
        ...slice,
        mutate: mutateFns.current[def.key],
      };
    } else {
      const slice = queryState[def.key] ?? {
        loading: false,
        data: undefined,
        error: undefined,
      };
      result[def.key] = {
        ...slice,
        refetch: () => fetchQuery(def),
      };
    }
  });

  return result as any;
}
