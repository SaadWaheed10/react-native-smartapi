import type { SmartApiError, SmartApiRequestConfig, SmartApiResponse } from '../core/types';

export interface RequestLogEntry {
  id: string;
  method: string;
  url: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status?: number;
  fromCache?: boolean;
  error?: { code: string; message: string; type: string };
  request: Pick<SmartApiRequestConfig, 'params' | 'data' | 'headers'>;
}

type Listener = (entries: RequestLogEntry[]) => void;

const MAX_ENTRIES = 100;

/**
 * Lightweight in-memory request inspector for `__DEV__`.
 * Enable via `configureApi({ devtools: { enabled: true } })`.
 */
export class RequestLog {
  private entries: RequestLogEntry[] = [];
  private listeners = new Set<Listener>();
  private enabled: boolean;

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  start(config: SmartApiRequestConfig): string | null {
    if (!this.enabled) return null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: RequestLogEntry = {
      id,
      method: (config.method ?? 'GET').toUpperCase(),
      url: config.url,
      startedAt: Date.now(),
      request: {
        params: config.params,
        data: config.data,
        headers: config.headers,
      },
    };
    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES);
    this.emit();
    return id;
  }

  success(id: string | null, response: SmartApiResponse): void {
    if (!this.enabled || !id) return;
    this.patch(id, {
      endedAt: Date.now(),
      status: response.status,
      fromCache: response.fromCache,
    });
  }

  failure(id: string | null, error: SmartApiError): void {
    if (!this.enabled || !id) return;
    this.patch(id, {
      endedAt: Date.now(),
      status: error.status,
      error: { code: error.code, message: error.message, type: error.type },
    });
  }

  getEntries(): RequestLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private patch(id: string, patch: Partial<RequestLogEntry>): void {
    this.entries = this.entries.map((entry) => {
      if (entry.id !== id) return entry;
      const endedAt = patch.endedAt ?? entry.endedAt;
      return {
        ...entry,
        ...patch,
        durationMs: endedAt ? endedAt - entry.startedAt : entry.durationMs,
      };
    });
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getEntries();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
