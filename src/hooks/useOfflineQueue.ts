import { useCallback, useEffect, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { QueuedRequest } from '../offline/OfflineQueue';

export interface UseOfflineQueueOptions {
  client?: SmartApiClient;
}

export interface UseOfflineQueueState {
  /** Queued mutation requests waiting for connectivity. */
  queue: QueuedRequest[];
  /** Number of queued items. */
  size: number;
  /** True when the device is believed to be online. */
  isOnline: boolean;
  /** Manually flush the queue (no-op when offline). */
  flush: () => Promise<void>;
  /** Drop all queued requests. */
  clear: () => void;
  /** Remove a single queued request by id. */
  remove: (id: string) => void;
}

/**
 * Observe and control the offline mutation queue:
 *
 *   const { size, queue, isOnline, flush } = useOfflineQueue();
 *   {size > 0 && <Text>{size} changes waiting to sync</Text>}
 */
export function useOfflineQueue(options: UseOfflineQueueOptions = {}): UseOfflineQueueState {
  const { client } = options;
  const apiClient = client ?? getDefaultApi();

  const [queue, setQueue] = useState<QueuedRequest[]>(() => apiClient.offline.getItems());
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const api = client ?? getDefaultApi();
    void api.offline.ready().then(() => setQueue(api.offline.getItems()));
    const unsubQueue = api.offline.subscribe(setQueue);
    const unsubNet = api.network.onChange(setIsOnline);
    void api.network.isOnline().then(setIsOnline);
    return () => {
      unsubQueue();
      unsubNet();
    };
  }, [client]);

  const flush = useCallback(async () => {
    await (client ?? getDefaultApi()).offline.flush();
  }, [client]);

  const clear = useCallback(() => {
    (client ?? getDefaultApi()).offline.clear();
  }, [client]);

  const remove = useCallback(
    (id: string) => {
      (client ?? getDefaultApi()).offline.remove(id);
    },
    [client]
  );

  return {
    queue,
    size: queue.length,
    isOnline,
    flush,
    clear,
    remove,
  };
}
