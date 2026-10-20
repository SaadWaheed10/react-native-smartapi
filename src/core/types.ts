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
  /**
   * Send `If-None-Match` with the last ETag and treat HTTP 304 as a cache hit.
   * Default: false (enable globally via `cache.etag: true` or per-request).
   */
  etag?: boolean;
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

/** How to resolve HTTP 409 conflicts when flushing the offline queue / sync mutations. */
export type ConflictStrategy =
  | 'server-wins'
  | 'client-wins'
  | 'ask'
  | ((ctx: {
      config: SmartApiRequestConfig;
      error: SmartApiError;
      server: any;
    }) => any | Promise<any>);

export interface OfflineConfig {
  enabled?: boolean;
  /** Queue mutating requests (POST/PUT/PATCH/DELETE) while offline and flush on reconnect. */
  queueMutations?: boolean;
  /** Serve cached GET responses when offline, if available. */
  fallbackToCache?: boolean;
  /**
   * Persist the offline queue to AsyncStorage so it survives app restarts.
   * Default: true when `@react-native-async-storage/async-storage` is installed.
   */
  persist?: boolean;
  /** AsyncStorage key for the persisted queue. Default: `@smartapi:offline-queue`. */
  storageKey?: string;
  /**
   * When true (default), queued mutations throw `REQUEST_QUEUED_OFFLINE`.
   * When false, they resolve with `{ queued: true, ok: false, status: 0 }`.
   */
  throwOnQueue?: boolean;
  /**
   * Conflict strategy when a flushed mutation returns 409.
   * Default: `'server-wins'` (drop the queued client change).
   */
  onConflict?: ConflictStrategy;
}

export interface DevtoolsConfig {
  /** Capture requests in an in-memory inspector (`api.devtools`). Default: false. */
  enabled?: boolean;
}

/** Transport used for the underlying HTTP call. */
export type TransportType = 'fetch' | 'xhr' | 'auto';

export interface LoggerConfig {
  enabled?: boolean;
  /** Mask sensitive keys (password, token, secret, authorization, etc.) in logs. Default: true. */
  maskSensitiveData?: boolean;
  /** Additional key names to mask. */
  sensitiveKeys?: string[];
  /**
   * Extra privacy redaction — string keys and/or RegExp matched against string values
   * (phones, emails, national IDs, etc.).
   *
   *   redact: ['phone', 'cnic', /\\b\\d{16}\\b/]
   */
  redact?: Array<string | RegExp>;
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

  /** True when this error represents a request timeout. */
  get isTimeout(): boolean {
    return this.type === 'TIMEOUT_ERROR' || this.code === 'TIMEOUT';
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

/** Type guard for timeout errors. */
export function isTimeoutError(error: unknown): error is SmartApiError {
  return error instanceof SmartApiError && error.isTimeout;
}

export interface SmartApiRequestConfig {
  method?: HttpMethod;
  url: string;
  baseURL?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  /**
   * Friendly message used when this request times out.
   * Overrides the default "The request timed out…" copy.
   */
  timeoutMessage?: string;
  /** Dot-path (e.g. "data.users" or "profile.name") to auto-extract from the response body. */
  select?: string;
  /** Transform function applied to the (optionally selected) response data. */
  transform?: (data: any) => any;
  /**
   * Optional runtime schema (Zod or any `{ parse }` / `{ safeParse }` object).
   * Validated after `select` / `transform`. Throws `VALIDATION_ERROR` on mismatch.
   */
  schema?: import('./schema').SchemaLike;
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
  /** Called with upload progress (0-100). Requires XHR transport (auto-selected when set). */
  onUploadProgress?: (percent: number) => void;
  /** Called with download progress (0-100). Requires XHR transport (auto-selected when set). */
  onDownloadProgress?: (percent: number) => void;
  /**
   * HTTP transport. `auto` (default) uses XHR when progress callbacks or FormData
   * are present, otherwise `fetch`.
   */
  transport?: TransportType;
}

export interface SmartApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  ok: boolean;
  fromCache?: boolean;
  /** True when the mutation was queued because the device is offline. */
  queued?: boolean;
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

export interface GlobalErrorContext {
  config: SmartApiRequestConfig;
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
  /**
   * Default HTTP transport for all requests. Per-request `transport` overrides this.
   * Default: `'auto'`.
   */
  transport?: TransportType;
  /** In-memory request inspector for development. */
  devtools?: DevtoolsConfig;
  /**
   * Default stale time (ms) for React query hooks — data younger than this
   * is considered fresh and won't refetch on remount/focus. Default: 0.
   */
  staleTime?: number;
  /**
   * Auto-tune timeout/retry from NetInfo quality (wifi / cellular / 2G).
   * Default: false.
   */
  networkAware?: boolean;
  /**
   * Circuit breaker — stop hammering a failing API after N errors.
   * Set `true` for defaults, or pass `{ threshold, cooldownMs, fallback }`.
   */
  circuitBreaker?: boolean | import('./CircuitBreaker').CircuitBreakerConfig;
  /**
   * Active locale for error messages. Used with `locales` map.
   * Example: `'ur'`, `'en'`, `'ar'`.
   */
  locale?: string;
  /**
   * Localized error message maps keyed by locale then error code.
   *
   *   locales: { ur: { NO_INTERNET: 'انٹرنیٹ دستیاب نہیں' } }
   */
  locales?: Record<string, Record<string, string>>;
  /**
   * One-line config packs: `['json', 'retrySafe', 'offlineQueue', 'devLog']`.
   * Applied before explicit options (explicit wins on conflicts).
   */
  presets?: import('./presets').PresetName[];
  /**
   * Dev / UI mock layer. When enabled, matching handlers short-circuit the network.
   * See `MockConfig` for handler key format (`"GET /users"`).
   */
  mock?: import('./mock').MockConfig;
  /**
   * Global UI bridge for errors (toasts, analytics). Skips `CANCELLED`.
   * Prefer this over per-screen try/catch for user-facing messages.
   */
  onError?: (error: SmartApiError, ctx: GlobalErrorContext) => void | Promise<void>;
  /** Called when a mutation is queued because the device is offline. */
  onQueued?: (config: SmartApiRequestConfig) => void | Promise<void>;
  /** Optional global success hook (analytics, silent logging). */
  onSuccess?: (response: SmartApiResponse) => void | Promise<void>;
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
  errorInterceptors?: ErrorInterceptor[];
}
