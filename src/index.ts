// -----------------------------------------------------------------------
// react-native-smartapi — public API surface
// -----------------------------------------------------------------------

// Core client + factory functions
export { SmartApiClient } from './core/SmartApiClient';
export { createApi, configureApi, getDefaultApi, api } from './core/config';
export { QueryManager } from './core/QueryManager';
export { defineApi, isDefinedEndpoint, interpolateUrl } from './core/defineApi';
export { applyPresets, withAuth, withCache, withOffline, PRESETS } from './core/presets';
export { resolveMockResponse } from './core/mock';
export { createEnvConfig, detectEnvironment } from './core/createEnvConfig';
export { validateWithSchema } from './core/schema';
export { openStream } from './core/stream';

// Errors
export { SmartApiError, isTimeoutError } from './core/types';
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
export type { QueuedRequest } from './offline/OfflineQueue';

// Transform / selection helpers
export { selectData } from './transform/DataSelector';
export { applyTransform, renameKeys, convertDates } from './transform/DataTransformer';

// Utilities
export { Logger } from './utils/logger';
export { getByPath, buildQueryString, deepMerge, joinUrl } from './utils/helpers';
export { createFormData } from './utils/formData';
export type { FormDataValue, RnFile } from './utils/formData';

// Devtools
export { RequestLog } from './devtools/RequestLog';
export type { RequestLogEntry } from './devtools/RequestLog';

// React hooks
export { useApi } from './hooks/useApi';
export { useGet } from './hooks/useGet';
export { usePost } from './hooks/usePost';
export { useMutation } from './hooks/useMutation';
export { useInfiniteApi } from './hooks/useInfiniteApi';
export { usePaginatedList } from './hooks/usePaginatedList';
export { useSuspenseGet, clearSuspenseCache } from './hooks/useSuspenseGet';
export { useUpload } from './hooks/useUpload';
export { useDownload } from './hooks/useDownload';
export { useOfflineQueue } from './hooks/useOfflineQueue';
export { useRequestLog } from './hooks/useRequestLog';

// Types
export type {
  HttpMethod,
  CachePolicy,
  CacheConfig,
  RetryConfig,
  AuthConfig,
  OfflineConfig,
  LoggerConfig,
  DevtoolsConfig,
  TransportType,
  ErrorType,
  SmartApiErrorShape,
  SmartApiRequestConfig,
  SmartApiResponse,
  SmartApiConfig,
  GlobalErrorContext,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  DeviceInfoProvider,
} from './core/types';

export type {
  EndpointDefinition,
  EndpointCallOptions,
  DefinedEndpoint,
  DefinedApi,
  DefineApiOptions,
  PathParams,
} from './core/defineApi';

export type { PresetName } from './core/presets';
export type { MockConfig, MockHandlerFn, MockHandlerResult } from './core/mock';
export type { SchemaLike } from './core/schema';
export type {
  EnvConfigMap,
  AppEnvironment,
  CreateEnvConfigOptions,
} from './core/createEnvConfig';
export type { StreamOptions, StreamEvent, StreamHandle } from './core/stream';

export type { UseApiOptions, UseApiState, PollWhen } from './hooks/useApi';
export type {
  UseSuspenseGetOptions,
  UseSuspenseGetState,
} from './hooks/useSuspenseGet';
export type {
  UseMutationOptions,
  UseMutationState,
  OptimisticUpdateConfig,
} from './hooks/useMutation';
export type {
  UseInfiniteApiOptions,
  UseInfiniteApiState,
  PageParam,
} from './hooks/useInfiniteApi';
export type {
  UsePaginatedListOptions,
  UsePaginatedListState,
  PaginatedFlatListProps,
} from './hooks/usePaginatedList';
export type { UseUploadOptions, UseUploadState } from './hooks/useUpload';
export type { UseDownloadOptions, UseDownloadState } from './hooks/useDownload';
export type { UseOfflineQueueOptions, UseOfflineQueueState } from './hooks/useOfflineQueue';
export type { UseRequestLogOptions } from './hooks/useRequestLog';
export type { UrlInput } from './hooks/resolveEndpoint';
