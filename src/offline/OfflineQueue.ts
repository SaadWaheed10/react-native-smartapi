import type { SmartApiRequestConfig } from '../core/types';
import { NetworkMonitor } from './NetworkMonitor';

type QueuedRequest = {
  id: string;
  config: SmartApiRequestConfig;
  enqueuedAt: number;
};

type Flusher = (config: SmartApiRequestConfig) => Promise<any>;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private networkMonitor: NetworkMonitor;
  private flusher: Flusher | null = null;
  private flushing = false;

  constructor(networkMonitor: NetworkMonitor) {
    this.networkMonitor = networkMonitor;
    this.networkMonitor.onChange((isOnline) => {
      if (isOnline) void this.flush();
    });
  }

  setFlusher(flusher: Flusher) {
    this.flusher = flusher;
  }

  static isMutation(method?: string): boolean {
    return MUTATING_METHODS.has((method ?? 'GET').toUpperCase());
  }

  enqueue(config: SmartApiRequestConfig): void {
    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      config,
      enqueuedAt: Date.now(),
    });
  }

  size(): number {
    return this.queue.length;
  }

  peekAll(): SmartApiRequestConfig[] {
    return this.queue.map((q) => q.config);
  }

  clear(): void {
    this.queue = [];
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.flusher || this.queue.length === 0) return;
    this.flushing = true;

    try {
      const isOnline = await this.networkMonitor.isOnline();
      if (!isOnline) return;

      const pending = [...this.queue];
      this.queue = [];

      for (const item of pending) {
        try {
          await this.flusher(item.config);
        } catch {
          // Re-queue on failure so it's retried on the next reconnect event.
          this.queue.push(item);
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
