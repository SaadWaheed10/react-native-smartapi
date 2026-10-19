import type { AuthConfig, CacheConfig, OfflineConfig, SmartApiConfig } from './types';

/** Named one-line config packs for common app setups. */
export type PresetName =
  | 'json'
  | 'authBearer'
  | 'retrySafe'
  | 'offlineQueue'
  | 'devLog'
  | 'cacheShort';

export const PRESETS: Record<PresetName, Partial<SmartApiConfig>> = {
  /** Sensible JSON Accept / Content-Type defaults. */
  json: {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },
  /**
   * Marks the client as auth-ready. Still pass `auth: { getToken, ... }` —
   * this preset only ensures Bearer-style defaults are expected.
   */
  authBearer: {
    // TokenManager already defaults to Authorization: Bearer
  },
  /** Retry transient failures (5xx / network-ish status codes). */
  retrySafe: {
    retry: { enabled: true, attempts: 3, baseDelayMs: 300 },
  },
  /** Offline mutation queue + cache fallback for GETs. */
  offlineQueue: {
    offline: {
      enabled: true,
      queueMutations: true,
      fallbackToCache: true,
      persist: true,
    },
  },
  /** Verbose logging + in-memory request inspector (great for __DEV__). */
  devLog: {
    logger: { enabled: true, level: 'debug' },
    devtools: { enabled: true },
  },
  /** Short-lived memory cache + hook staleTime. */
  cacheShort: {
    cache: { enabled: true, ttl: 60_000, policy: 'cache-first' },
    staleTime: 30_000,
  },
};

/** Merge named presets left-to-right, then overlay explicit config. */
export function applyPresets(
  presets: PresetName[] | undefined,
  config: SmartApiConfig = {}
): SmartApiConfig {
  if (!presets?.length) return config;

  let merged: SmartApiConfig = {};
  for (const name of presets) {
    const preset = PRESETS[name];
    if (!preset) continue;
    merged = deepMergeConfigs(merged, preset);
  }
  return deepMergeConfigs(merged, config);
}

export function withAuth(auth: AuthConfig): Partial<SmartApiConfig> {
  return { auth };
}

export function withCache(cache: CacheConfig | boolean = true): Partial<SmartApiConfig> {
  if (cache === true) return { cache: { enabled: true } };
  if (cache === false) return { cache: { enabled: false } };
  return { cache };
}

export function withOffline(offline: OfflineConfig = {}): Partial<SmartApiConfig> {
  return {
    offline: {
      enabled: true,
      queueMutations: true,
      fallbackToCache: true,
      persist: true,
      ...offline,
    },
  };
}

function deepMergeConfigs(a: SmartApiConfig, b: Partial<SmartApiConfig>): SmartApiConfig {
  return {
    ...a,
    ...b,
    headers: { ...a.headers, ...b.headers },
    auth: b.auth ? { ...a.auth, ...b.auth } : a.auth,
    cache: b.cache ? { ...(typeof a.cache === 'object' ? a.cache : {}), ...b.cache } : a.cache,
    retry: b.retry ? { ...(typeof a.retry === 'object' ? a.retry : {}), ...b.retry } : a.retry,
    offline: b.offline ? { ...a.offline, ...b.offline } : a.offline,
    logger: b.logger ? { ...a.logger, ...b.logger } : a.logger,
    devtools: b.devtools ? { ...a.devtools, ...b.devtools } : a.devtools,
    mock: b.mock ? { ...a.mock, ...b.mock, handlers: { ...a.mock?.handlers, ...b.mock?.handlers } } : a.mock,
    errorMap: { ...a.errorMap, ...b.errorMap },
  };
}
