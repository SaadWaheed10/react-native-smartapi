import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import { optionalRequire } from '../utils/helpers';

export interface BackgroundSyncOptions {
  /** Task name registered with the OS / Expo. Default: `smartapi-offline-flush`. */
  taskName?: string;
  /** Desired interval in minutes (best-effort). Default: 15. */
  intervalMinutes?: number;
  client?: SmartApiClient;
}

export interface BackgroundSyncHandle {
  /** Unregister / stop the background task (best-effort). */
  stop: () => Promise<void>;
  /** Manually flush now. */
  flush: () => Promise<void>;
  /** True when a native background API was found and registered. */
  registered: boolean;
}

/**
 * Register a best-effort background flush of the offline mutation queue.
 * Works with Expo TaskManager + BackgroundFetch when installed; otherwise
 * falls back to an AppState "active" flush via NetInfo reconnect (already
 * handled by OfflineQueue) and still exposes `flush()`.
 *
 *   await registerBackgroundSync({ intervalMinutes: 15 });
 */
export async function registerBackgroundSync(
  options: BackgroundSyncOptions = {}
): Promise<BackgroundSyncHandle> {
  const taskName = options.taskName ?? 'smartapi-offline-flush';
  const intervalMinutes = options.intervalMinutes ?? 15;
  const client = options.client ?? getDefaultApi();

  const flush = async () => {
    await client.offline.flush();
  };

  const TaskManager = optionalRequire<any>('expo-task-manager');
  const BackgroundFetch = optionalRequire<any>('expo-background-fetch');

  let registered = false;

  if (TaskManager?.defineTask && BackgroundFetch?.registerTaskAsync) {
    try {
      if (!TaskManager.isTaskDefined?.(taskName)) {
        TaskManager.defineTask(taskName, async () => {
          try {
            await flush();
            return BackgroundFetch.BackgroundFetchResult?.NewData ?? 1;
          } catch {
            return BackgroundFetch.BackgroundFetchResult?.Failed ?? 2;
          }
        });
      }

      await BackgroundFetch.registerTaskAsync(taskName, {
        minimumInterval: intervalMinutes * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      registered = true;
    } catch {
      registered = false;
    }
  }

  return {
    registered,
    flush,
    stop: async () => {
      if (registered && BackgroundFetch?.unregisterTaskAsync) {
        try {
          await BackgroundFetch.unregisterTaskAsync(taskName);
        } catch {
          // ignore
        }
      }
    },
  };
}
