/**
 * Core type definitions shared across the SmartAPI package.
 */

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type CachePolicy = 'no-cache' | 'cache-first' | 'network-first' | 'stale-while-revalidate';

export interface CacheConfig {
  enabled?: boolean;
  /** Time to live in milliseconds. Default: 5 minutes. */
  ttl?: number;
  /** Where to persist cache entries. Default: 'memory'. */
  storage?: 'memory' | 'persistent';
  /** Cache lookup/refresh strategy. Default: 'cache-first'. */
  policy?: CachePolicy;
  /** Explicit cache key override. Defaults to method + url + params. */
  key?: string;
}

export interface RetryConfig {
  enabled?: boolean;
  /** Max retry attempts (not counting the initial request). Default: 3. */
  attempts?: number;
  /** Base delay in ms used for exponential backoff. Default: 300. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 8000. */
  maxDelayMs?: number;
  /** Called to decide if a given error should be retried. */
  retryCondition?: (error: SmartApiError, attempt: number) => boolean;
  /** HTTP status codes that should trigger a retry. Default: [408, 429, 500, 502, 503, 504]. */
  retryStatusCodes?: number[];
}

export interface AuthConfig {
  /** Returns the current access token (sync or async). */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Header name for the token. Default: 'Authorization'. */
  headerName?: string;
  /** Scheme prefix. Default: 'Bearer'. Set to '' for no prefix. */
  scheme?: string;
  /** Called when a 401 is received; should resolve with a new access token or null/undefined to give up. */
  onRefreshToken?: () => Promise<string | null | undefined>;
  /** Called when refresh fails / user should be logged out. */
  onUnauthorized?: () => void | Promise<void>;
  /** Max number of refresh attempts per request chain. Default: 1. */
  maxRefreshAttempts?: number;
}

export interface OfflineConfig {
  enabled?: boolean;
  /** Queue mutating requests (POST/PUT/PATCH/DELETE) while offline and flush on reconnect. */
  queueMutations?: boolean;
  /** Serve cached GET responses when offline, if available. */
  fallbackToCache?: boolean;
}

export interface LoggerConfig {
  enabled?: boolean;
  /** Mask sensitive keys (password, token, secret, authorization, etc.) in logs. Default: true. */
  maskSensitiveData?: boolean;
  /** Additional key names to mask. */
  sensitiveKeys?: string[];
  level?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export type ErrorType =
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'CANCELLED'
  | 'PARSE_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

/** Unified error shape returned by every SmartAPI operation. */
export interface SmartApiErrorShape {
  code: string;
  status: number;
  message: string;
  type: ErrorType;
  details?: any;
}

export class SmartApiError extends Error implements SmartApiErrorShape {
  code: string;
  status: number;
  type: ErrorType;
  details?: any;

  constructor(shape: SmartApiErrorShape) {
    super(shape.message);
    this.name = 'SmartApiError';
    this.code = shape.code;
    this.status = shape.status;
    this.type = shape.type;
    this.details = shape.details;
    Object.setPrototypeOf(this, SmartApiError.prototype);
  }

  toJSON(): SmartApiErrorShape {
    return {
      code: this.code,
      status: this.status,
      message: this.message,
      type: this.type,
      details: this.details,
    };
  }
}

export interface SmartApiRequestConfig {
  method?: HttpMethod;
  url: string;
  baseURL?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  /** Dot-path (e.g. "data.users" or "profile.name") to auto-extract from the response body. */
  select?: string;
  /** Transform function applied to the (optionally selected) response data. */
  transform?: (data: any) => any;
  cache?: CacheConfig | boolean;
  retry?: RetryConfig | boolean;
  /** Skip auth header injection for this request. */
  skipAuth?: boolean;
  /** Skip all interceptors for this request. */
  skipInterceptors?: boolean;
  signal?: AbortSignal;
  /** Raw fetch options passthrough (advanced use). */
  fetchOptions?: RequestInit;
  /** Multipart/form-data body helper. When set, `data` is ignored. */
  formData?: Record<string, any>;
  /** Custom mapping of backend error codes -> human readable messages. */
  errorMap?: Record<string, string>;
  /** Called with upload progress (0-100). Only applies to uploads via XHR path. */
  onUploadProgress?: (percent: number) => void;
  /** Called with download progress (0-100). */
  onDownloadProgress?: (percent: number) => void;
}

export interface SmartApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  ok: boolean;
  fromCache?: boolean;
  config: SmartApiRequestConfig;
}

export type RequestInterceptor = (
  config: SmartApiRequestConfig
) => SmartApiRequestConfig | Promise<SmartApiRequestConfig>;

export type ResponseInterceptor = (
  response: SmartApiResponse
) => SmartApiResponse | Promise<SmartApiResponse>;

export type ErrorInterceptor = (
  error: SmartApiError
) => SmartApiError | Promise<SmartApiError> | Promise<SmartApiResponse> | SmartApiResponse;

export interface DeviceInfoProvider {
  getPlatform?: () => 'ios' | 'android' | 'web' | 'unknown';
  getAppVersion?: () => string | undefined;
  getDeviceId?: () => string | undefined;
}

export interface SmartApiConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  cache?: CacheConfig;
  retry?: RetryConfig;
  offline?: OfflineConfig;
  logger?: LoggerConfig;
  errorMap?: Record<string, string>;
  deviceInfo?: DeviceInfoProvider;
  /** Attach app version / platform / device id headers automatically. Default: true. */
  attachDeviceHeaders?: boolean;
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
  errorInterceptors?: ErrorInterceptor[];
}
