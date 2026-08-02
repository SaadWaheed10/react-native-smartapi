// -----------------------------------------------------------------------
// react-native-smartapi — public API surface
// -----------------------------------------------------------------------

// Core client + factory functions
export { SmartApiClient } from './core/SmartApiClient';
export { createApi, configureApi, getDefaultApi, api } from './core/config';

// Errors
export { SmartApiError } from './core/types';
export { ErrorEngine } from './errors/ErrorEngine';
export { HTTP_STATUS_MESSAGES, NETWORK_ERROR_MESSAGES } from './errors/errorMaps';

// Cache
export { CacheManager } from './cache/CacheManager';
export { MemoryCache } from './cache/MemoryCache';
export { PersistentCache } from './cache/PersistentCache';

// Retry
export { RetryManager } from './retry/RetryManager';

// Auth
export { TokenManager } from './auth/TokenManager';

// Offline
export { NetworkMonitor } from './offline/NetworkMonitor';
export { OfflineQueue } from './offline/OfflineQueue';

// Transform / selection helpers
export { selectData } from './transform/DataSelector';
export { applyTransform, renameKeys, convertDates } from './transform/DataTransformer';

// Utilities
export { Logger } from './utils/logger';
export { getByPath, buildQueryString, deepMerge, joinUrl } from './utils/helpers';

// React hooks
export { useApi } from './hooks/useApi';
export { useGet } from './hooks/useGet';
export { usePost } from './hooks/usePost';
export { useMutation } from './hooks/useMutation';
export { useInfiniteApi } from './hooks/useInfiniteApi';
export { useUpload } from './hooks/useUpload';
export { useDownload } from './hooks/useDownload';

// Types
export type {
  HttpMethod,
  CachePolicy,
  CacheConfig,
  RetryConfig,
  AuthConfig,
  OfflineConfig,
  LoggerConfig,
  ErrorType,
  SmartApiErrorShape,
  SmartApiRequestConfig,
  SmartApiResponse,
  SmartApiConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  DeviceInfoProvider,
} from './core/types';

export type { UseApiOptions, UseApiState } from './hooks/useApi';
export type { UseMutationOptions, UseMutationState } from './hooks/useMutation';
export type { UseInfiniteApiOptions, UseInfiniteApiState } from './hooks/useInfiniteApi';
export type { UseUploadOptions, UseUploadState } from './hooks/useUpload';
export type { UseDownloadOptions, UseDownloadState } from './hooks/useDownload';
