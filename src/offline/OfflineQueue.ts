import type { OfflineConfig, SmartApiRequestConfig } from '../core/types';
import { optionalRequire } from '../utils/helpers';
import { NetworkMonitor } from './NetworkMonitor';

export type QueuedRequest = {
  id: string;
  config: SmartApiRequestConfig;
  enqueuedAt: number;
};

type Flusher = (config: SmartApiRequestConfig) => Promise<any>;
type QueueListener = (queue: QueuedRequest[]) => void;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_STORAGE_KEY = '@smartapi:offline-queue';

/**
 * Offline mutation queue. Optionally persists to AsyncStorage so queued
 * requests survive app restarts when the peer dependency is installed.
 */
export class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private networkMonitor: NetworkMonitor;
  private flusher: Flusher | null = null;
  private flushing = false;
  private listeners = new Set<QueueListener>();
  private asyncStorage: any;
  private persistEnabled: boolean;
  private storageKey: string;
  private hydrated = false;
  private hydratePromise: Promise<void>;

  constructor(networkMonitor: NetworkMonitor, offlineConfig: OfflineConfig = {}) {
    this.networkMonitor = networkMonitor;
    this.storageKey = offlineConfig.storageKey ?? DEFAULT_STORAGE_KEY;

    const mod = optionalRequire<any>('@react-native-async-storage/async-storage');
    this.asyncStorage = mod?.default ?? mod;
    this.persistEnabled =
      (offlineConfig.persist ?? true) && !!this.asyncStorage;

    this.hydratePromise = this.hydrate();

    this.networkMonitor.onChange((isOnline) => {
      if (isOnline) void this.flush();
    });
  }

  setFlusher(flusher: Flusher) {
    this.flusher = flusher;
  }

  /** Update persist settings after `configure()`. */
  updateConfig(offlineConfig: OfflineConfig = {}): void {
    if (offlineConfig.storageKey) this.storageKey = offlineConfig.storageKey;
    if (offlineConfig.persist !== undefined) {
      this.persistEnabled = offlineConfig.persist && !!this.asyncStorage;
    }
  }

  static isMutation(method?: string): boolean {
    return MUTATING_METHODS.has((method ?? 'GET').toUpperCase());
  }

  async ready(): Promise<void> {
    await this.hydratePromise;
  }

  enqueue(config: SmartApiRequestConfig): QueuedRequest {
    // Strip non-serializable fields before persisting.
    const serializable: SmartApiRequestConfig = {
      ...config,
      signal: undefined,
      onUploadProgress: undefined,
      onDownloadProgress: undefined,
      transform: undefined,
    };

    const item: QueuedRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      config: serializable,
      enqueuedAt: Date.now(),
    };
    this.queue.push(item);
    void this.persist();
    this.emit();
    return item;
  }

  size(): number {
    return this.queue.length;
  }

  peekAll(): SmartApiRequestConfig[] {
    return this.queue.map((q) => q.config);
  }

  getItems(): QueuedRequest[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
    void this.persist();
    this.emit();
  }

  remove(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
    void this.persist();
    this.emit();
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async flush(): Promise<void> {
    await this.ready();
    if (this.flushing || !this.flusher || this.queue.length === 0) return;
    this.flushing = true;

    try {
      const isOnline = await this.networkMonitor.isOnline();
      if (!isOnline) return;

      const pending = [...this.queue];
      this.queue = [];
      void this.persist();
      this.emit();

      for (const item of pending) {
        try {
          await this.flusher(item.config);
        } catch {
          // Re-queue on failure so it's retried on the next reconnect event.
          this.queue.push(item);
        }
      }

      if (this.queue.length > 0) {
        void this.persist();
        this.emit();
      }
    } finally {
      this.flushing = false;
    }
  }

  private async hydrate(): Promise<void> {
    if (!this.persistEnabled || this.hydrated) {
      this.hydrated = true;
      return;
    }
    try {
      const raw = await this.asyncStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as QueuedRequest[];
        if (Array.isArray(parsed)) {
          this.queue = parsed;
          this.emit();
        }
      }
    } catch {
      // Corrupt storage — start fresh.
      this.queue = [];
    } finally {
      this.hydrated = true;
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistEnabled) return;
    try {
      await this.asyncStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch {
      // Best-effort persistence.
    }
  }

  private emit(): void {
    const snapshot = this.getItems();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // ignore
      }
    });
  }
}
