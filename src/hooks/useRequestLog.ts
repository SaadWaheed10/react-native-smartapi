import { useEffect, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { RequestLogEntry } from '../devtools/RequestLog';

export interface UseRequestLogOptions {
  client?: SmartApiClient;
}

/**
 * Subscribe to the in-memory request inspector (enable via `devtools: { enabled: true }`).
 *
 *   const entries = useRequestLog();
 */
export function useRequestLog(options: UseRequestLogOptions = {}): RequestLogEntry[] {
  const { client } = options;
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);

  useEffect(() => {
    const api = client ?? getDefaultApi();
    return api.devtools.subscribe(setEntries);
  }, [client]);

  return entries;
}
