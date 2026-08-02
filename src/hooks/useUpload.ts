import { useCallback, useState } from 'react';
import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiError, SmartApiRequestConfig } from '../core/types';

export interface UseUploadOptions extends Omit<SmartApiRequestConfig, 'url' | 'method' | 'formData'> {
  client?: SmartApiClient;
  onSuccess?: (data: any) => void;
  onError?: (error: SmartApiError) => void;
}

export interface UseUploadState<T> {
  data: T | undefined;
  loading: boolean;
  error: SmartApiError | undefined;
  progress: number;
  upload: (
    files: Record<string, { uri: string; name: string; type: string } | Blob | File>,
    extraFields?: Record<string, any>
  ) => Promise<T>;
  reset: () => void;
}

/**
 * File upload hook with progress tracking:
 *
 *   const { upload, progress, loading } = useUpload('/avatar');
 *   await upload({ file: { uri, name: 'avatar.jpg', type: 'image/jpeg' } });
 */
export function useUpload<T = any>(url: string, options: UseUploadOptions = {}): UseUploadState<T> {
  const { client, onSuccess, onError, ...requestConfig } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartApiError | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  const upload = useCallback(
    async (
      files: Record<string, { uri: string; name: string; type: string } | Blob | File>,
      extraFields?: Record<string, any>
    ): Promise<T> => {
      const apiClient = client ?? getDefaultApi();
      setLoading(true);
      setError(undefined);
      setProgress(0);

      try {
        const response = await apiClient.upload<T>(url, files, extraFields, {
          ...requestConfig,
          onUploadProgress: (percent) => {
            setProgress(percent);
            requestConfig.onUploadProgress?.(percent);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, client]
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setLoading(false);
    setProgress(0);
  }, []);

  return { data, loading, error, progress, upload, reset };
}
