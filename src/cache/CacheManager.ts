import { MemoryCache } from './MemoryCache';
import { PersistentCache } from './PersistentCache';
import type { CacheConfig } from '../core/types';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export class CacheManager {
  private memory = new MemoryCache();
  private persistent = new PersistentCache();
  private defaultConfig: Required<Pick<CacheConfig, 'enabled' | 'ttl' | 'storage' | 'policy'>>;

  constructor(globalConfig: CacheConfig = {}) {
    this.defaultConfig = {
      enabled: globalConfig.enabled ?? false,
      ttl: globalConfig.ttl ?? DEFAULT_TTL,
      storage: globalConfig.storage ?? 'memory',
      policy: globalConfig.policy ?? 'cache-first',
    };
  }

  resolveConfig(perRequest?: CacheConfig | boolean): Required<
    Pick<CacheConfig, 'enabled' | 'ttl' | 'storage' | 'policy'>
  > & { key?: string } {
    if (perRequest === false) return { ...this.defaultConfig, enabled: false };
    if (perRequest === true) return { ...this.defaultConfig, enabled: true };
    if (!perRequest) return this.defaultConfig;
    return {
      enabled: perRequest.enabled ?? this.defaultConfig.enabled,
      ttl: perRequest.ttl ?? this.defaultConfig.ttl,
      storage: perRequest.storage ?? this.defaultConfig.storage,
      policy: perRequest.policy ?? this.defaultConfig.policy,
      key: perRequest.key,
    };
  }

  async get<T = any>(key: string, storage: 'memory' | 'persistent'): Promise<T | undefined> {
    if (storage === 'persistent' && this.persistent.available) {
      const persisted = await this.persistent.get<T>(key);
      if (persisted !== undefined) return persisted;
    }
    return this.memory.get<T>(key);
  }

  async set<T = any>(
    key: string,
    value: T,
    ttlMs: number,
    storage: 'memory' | 'persistent'
  ): Promise<void> {
    this.memory.set(key, value, ttlMs);
    if (storage === 'persistent' && this.persistent.available) {
      await this.persistent.set(key, value, ttlMs);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memory.delete(key);
    await this.persistent.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    this.memory.invalidatePrefix(prefix);
  }

  async clearAll(): Promise<void> {
    this.memory.clear();
    await this.persistent.clear();
  }
}
