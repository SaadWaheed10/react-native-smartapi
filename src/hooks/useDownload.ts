import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseDownloadOptions extends Omit<SmartApiRequestConfig, 'url' | 'method'> {
  client?: SmartApiClient;
  onSuccess?: (data: Blob) => void;
  onError?: (error: SmartApiError) => void;
}

export interface UseDownloadState {
  data: Blob | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  progress: number;
  download: () => Promise<Blob>;
  reset: () => void;
}

/**
 * File download hook with progress tracking:
 *
 *   const { download, progress, data } = useDownload('/reports/latest.pdf');
 */
export function useDownload(url: string, options: UseDownloadOptions = {}): UseDownloadState {
  const { client, onSuccess, onError, ...requestConfig } = options;

  const [data, setData] = useState<Blob | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  const download = useCallback(async (): Promise<Blob> => {
    const apiClient = client ?? getDefaultApi();
    setLoading(true);
    setError(undefined);
    setProgress(0);

    try {
      const response = await apiClient.download(url, {
        ...requestConfig,
        onDownloadProgress: (percent) => {
          setProgress(percent);
          requestConfig.onDownloadProgress?.(percent);
        },
      });
      setData(response.data);
      onSuccess?.(response.data);
      return response.data;
    } catch (err) {
      const smartError = err as SmartApiError;
      setError(smartError);
      onError?.(smartError);
      throw smartError;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, client]);

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setLoading(false);
    setProgress(0);
  }, []);

  return { data, loading, error, progress, download, reset };
}
