import { optionalRequire } from '../utils/helpers';

interface StoredEntry<T = any> {
  value: T;
  expiresAt: number | null;
}

const KEY_PREFIX = '@smartapi:cache:';

/**
 * Persistent cache backed by `@react-native-async-storage/async-storage`.
 * This is an *optional* peer dependency — if the consumer hasn't installed
 * it, PersistentCache degrades to a no-op so the rest of the package keeps
 * working (falls back to memory-only caching upstream in CacheManager).
 */
export class PersistentCache {
  private asyncStorage: any;
  readonly available: boolean;

  constructor() {
    const mod = optionalRequire<any>('@react-native-async-storage/async-storage');
    this.asyncStorage = mod?.default ?? mod;
    this.available = !!this.asyncStorage;
  }

  private fullKey(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!this.available) return undefined;
    try {
      const raw = await this.asyncStorage.getItem(this.fullKey(key));
      if (!raw) return undefined;
      const entry: StoredEntry<T> = JSON.parse(raw);
      if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
        await this.delete(key);
        return undefined;
      }
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!this.available) return;
    try {
      const entry: StoredEntry<T> = {
        value,
        expiresAt: ttlMs ? Date.now() + ttlMs : null,
      };
      await this.asyncStorage.setItem(this.fullKey(key), JSON.stringify(entry));
    } catch {
      // Swallow storage errors (quota, serialization) — caching is best-effort.
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.asyncStorage.removeItem(this.fullKey(key));
    } catch {
      // no-op
    }
  }

  async clear(): Promise<void> {
    if (!this.available) return;
    try {
      const keys: string[] = await this.asyncStorage.getAllKeys();
      const smartApiKeys = keys.filter((k) => k.startsWith(KEY_PREFIX));
      await this.asyncStorage.multiRemove(smartApiKeys);
    } catch {
      // no-op
    }
  }
}
