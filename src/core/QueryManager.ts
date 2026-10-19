import { generateCacheKey } from '../utils/helpers';
import type { SmartApiRequestConfig } from './types';

export type QueryInvalidationEvent = {
  type: 'invalidate';
  /** Exact cache/query key, if provided. */
  key?: string;
  /** Prefix match (e.g. `GET:/users`). */
  prefix?: string;
};

export type QuerySetDataEvent = {
  type: 'setData';
  key: string;
  data: any;
};

export type QueryEvent = QueryInvalidationEvent | QuerySetDataEvent;

export type QueryListener = (event: QueryEvent) => void;

/**
 * In-flight request deduplication + invalidation / optimistic-data pub/sub
 * for React hooks. Lives per SmartApiClient so multi-instance apps stay isolated.
 */
export class QueryManager {
  private inflight = new Map<string, Promise<unknown>>();
  private listeners = new Set<QueryListener>();
  /** In-memory snapshot of the latest data per query key (for optimistic updates). */
  private dataStore = new Map<string, any>();

  /** Stable key for a request config (method + url + params). */
  static keyFrom(config: Pick<SmartApiRequestConfig, 'method' | 'url' | 'params'>): string {
    return generateCacheKey(config.method ?? 'GET', config.url, config.params);
  }

  /**
   * Share one in-flight promise across concurrent callers with the same key.
   * Prevents duplicate network calls when several hooks mount together.
   */
  dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = factory().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  subscribe(listener: QueryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Remember the latest successful data for a query key. */
  remember(key: string, data: any): void {
    this.dataStore.set(key, data);
  }

  getData<T = any>(key: string): T | undefined {
    return this.dataStore.get(key) as T | undefined;
  }

  /**
   * Optimistically write data for a key (and any keys that start with it)
   * and notify subscribed hooks without a network round-trip.
   */
  setData(key: string, data: any): void {
    this.dataStore.set(key, data);
    // Also update any stored keys that share this prefix (GET:/users → GET:/users:{...})
    for (const storedKey of this.dataStore.keys()) {
      if (storedKey !== key && storedKey.startsWith(key)) {
        this.dataStore.set(storedKey, data);
      }
    }
    this.emit({ type: 'setData', key, data });
  }

  /**
   * Apply an updater to the current stored data for `key`.
   * Returns the previous value (for rollback) and the next value.
   */
  updateData<T = any>(
    key: string,
    updater: (old: T | undefined) => T
  ): { previous: T | undefined; next: T } {
    const previous = this.getData<T>(key);
    // Prefer the most specific stored entry matching the prefix.
    let matchedPrevious = previous;
    if (matchedPrevious === undefined) {
      for (const [storedKey, value] of this.dataStore.entries()) {
        if (storedKey.startsWith(key) || key.startsWith(storedKey.split(':').slice(0, 2).join(':'))) {
          matchedPrevious = value as T;
          break;
        }
      }
      // Broader scan: any key containing the path
      if (matchedPrevious === undefined) {
        for (const [storedKey, value] of this.dataStore.entries()) {
          if (storedKey.includes(key) || key.includes(storedKey)) {
            matchedPrevious = value as T;
            break;
          }
        }
      }
    }
    const next = updater(matchedPrevious);
    this.setData(key, next);
    return { previous: matchedPrevious, next };
  }

  /** Notify subscribers that matching queries should refetch. */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
      this.emit({ type: 'invalidate' });
      return;
    }
    this.emit({ type: 'invalidate', key: keyOrPrefix, prefix: keyOrPrefix });
  }

  invalidatePrefix(prefix: string): void {
    this.emit({ type: 'invalidate', prefix });
  }

  /** True when `queryKey` matches an invalidation event. */
  static matches(queryKey: string, event: QueryInvalidationEvent): boolean {
    if (!event.key && !event.prefix) return true;
    if (event.key && (queryKey === event.key || queryKey.startsWith(event.key))) return true;
    if (event.prefix && queryKey.startsWith(event.prefix)) return true;
    return false;
  }

  /** True when a setData event should update this query key. */
  static matchesSetData(queryKey: string, event: QuerySetDataEvent): boolean {
    return (
      queryKey === event.key ||
      queryKey.startsWith(event.key) ||
      event.key.startsWith(queryKey.split(':').slice(0, 2).join(':')) ||
      queryKey.includes(event.key) ||
      event.key.includes(queryKey)
    );
  }

  private emit(event: QueryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the client.
      }
    });
  }

  destroy(): void {
    this.inflight.clear();
    this.listeners.clear();
    this.dataStore.clear();
  }
}
