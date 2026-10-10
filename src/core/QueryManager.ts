import { generateCacheKey } from '../utils/helpers';
import type { SmartApiRequestConfig } from './types';

export type QueryInvalidationEvent = {
  type: 'invalidate';
  /** Exact cache/query key, if provided. */
  key?: string;
  /** Prefix match (e.g. `GET:/users`). */
  prefix?: string;
};

export type QueryListener = (event: QueryInvalidationEvent) => void;

/**
 * In-flight request deduplication + invalidation pub/sub for React hooks.
 * Lives per SmartApiClient so multi-instance apps stay isolated.
 */
export class QueryManager {
  private inflight = new Map<string, Promise<unknown>>();
  private listeners = new Set<QueryListener>();

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

  /** Notify subscribers that matching queries should refetch. */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
      this.emit({ type: 'invalidate' });
      return;
    }
    // Treat as both exact key and prefix so `invalidate('/users')` and
    // `invalidate('GET:/users')` both work for consumers.
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

  private emit(event: QueryInvalidationEvent): void {
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
  }
}
