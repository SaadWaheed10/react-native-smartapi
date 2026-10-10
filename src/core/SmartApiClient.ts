import type {
  ErrorInterceptor,
  RequestInterceptor,
  ResponseInterceptor,
  SmartApiConfig,
  SmartApiRequestConfig,
  SmartApiResponse,
  TransportType,
} from './types';
import { SmartApiError } from './types';
import { ErrorEngine } from '../errors/ErrorEngine';
import { CacheManager } from '../cache/CacheManager';
import { RetryManager } from '../retry/RetryManager';
import { TokenManager } from '../auth/TokenManager';
import { NetworkMonitor } from '../offline/NetworkMonitor';
import { OfflineQueue } from '../offline/OfflineQueue';
import { Logger } from '../utils/logger';
import { createDefaultDeviceInfoProvider } from '../utils/deviceInfo';
import {
  createAuthInjector,
  createDeviceHeaderInjector,
  createRequestLogger,
} from '../interceptors/requestInterceptors';
import { createResponseLogger } from '../interceptors/responseInterceptors';
import { selectData } from '../transform/DataSelector';
import { applyTransform } from '../transform/DataTransformer';
import { buildQueryString, deepMerge, generateCacheKey, isPlainObject, joinUrl } from '../utils/helpers';
import { createFormData } from '../utils/formData';
import { QueryManager } from './QueryManager';
import { RequestLog } from '../devtools/RequestLog';
import { shouldUseXhr, xhrRequest } from './transports/xhrTransport';

const DEFAULT_TIMEOUT = 30000;

export class SmartApiClient {
  private config: SmartApiConfig;
  private errorEngine: ErrorEngine;
  private cacheManager: CacheManager;
  private retryManager: RetryManager;
  private tokenManager: TokenManager;
  private networkMonitor: NetworkMonitor;
  private offlineQueue: OfflineQueue;
  private queryManager: QueryManager;
  private requestLog: RequestLog;
  private logger: Logger;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: SmartApiConfig = {}) {
    this.config = config;
    this.logger = new Logger(config.logger);
    this.errorEngine = new ErrorEngine(config.errorMap);
    this.cacheManager = new CacheManager(config.cache);
    this.retryManager = new RetryManager(config.retry);
    this.tokenManager = new TokenManager(config.auth);
    this.networkMonitor = new NetworkMonitor();
    this.offlineQueue = new OfflineQueue(this.networkMonitor, config.offline);
    this.offlineQueue.setFlusher((cfg) => this.request(cfg));
    this.queryManager = new QueryManager();
    this.requestLog = new RequestLog(!!config.devtools?.enabled);

    const deviceInfo = config.deviceInfo ?? createDefaultDeviceInfoProvider();

    // Built-in interceptors run first, then user-supplied ones.
    this.requestInterceptors = [
      createAuthInjector(this.tokenManager),
      ...(config.attachDeviceHeaders !== false ? [createDeviceHeaderInjector(deviceInfo)] : []),
      createRequestLogger(this.logger),
      ...(config.requestInterceptors ?? []),
    ];

    this.responseInterceptors = [
      createResponseLogger(this.logger),
      ...(config.responseInterceptors ?? []),
    ];

    this.errorInterceptors = [...(config.errorInterceptors ?? [])];
  }

  // ---------------------------------------------------------------------
  // Public configuration API
  // ---------------------------------------------------------------------

  configure(partial: Partial<SmartApiConfig>): void {
    this.config = deepMerge(this.config, partial);
    if (partial.auth) this.tokenManager.updateConfig(partial.auth);
    if (partial.errorMap) this.errorEngine.setGlobalErrorMap(partial.errorMap);
    if (partial.logger) this.logger = new Logger({ ...this.config.logger, ...partial.logger });
    if (partial.offline) this.offlineQueue.updateConfig(partial.offline);
    if (partial.devtools) this.requestLog.setEnabled(!!partial.devtools.enabled);
  }

  useRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      this.requestInterceptors = this.requestInterceptors.filter((i) => i !== interceptor);
    };
  }

  useResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      this.responseInterceptors = this.responseInterceptors.filter((i) => i !== interceptor);
    };
  }

  useErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      this.errorInterceptors = this.errorInterceptors.filter((i) => i !== interceptor);
    };
  }

  /** Read-only snapshot of the active client configuration. */
  getConfig(): Readonly<SmartApiConfig> {
    return this.config;
  }

  get cache(): CacheManager {
    return this.cacheManager;
  }

  get offline(): OfflineQueue {
    return this.offlineQueue;
  }

  get network(): NetworkMonitor {
    return this.networkMonitor;
  }

  get queries(): QueryManager {
    return this.queryManager;
  }

  get devtools(): RequestLog {
    return this.requestLog;
  }

  /**
   * Invalidate cached responses and notify React hooks to refetch.
   * Pass a URL, cache key, or prefix — omit to invalidate everything.
   *
   *   api.invalidate('/users')
   *   api.invalidate('GET:/users')
   *   api.invalidate()
   */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
      void this.cacheManager.clearAll();
      this.queryManager.invalidate();
      return;
    }
    this.cacheManager.invalidatePrefix(keyOrPrefix);
    // Also try common GET: prefix forms.
    if (!keyOrPrefix.startsWith('GET:') && !keyOrPrefix.includes(':')) {
      this.cacheManager.invalidatePrefix(`GET:${keyOrPrefix}`);
    }
    this.queryManager.invalidate(keyOrPrefix);
  }

  // ---------------------------------------------------------------------
  // HTTP verb shorthands
  // ---------------------------------------------------------------------

  get<T = any>(url: string, config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}) {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  post<T = any>(url: string, data?: any, config: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> = {}) {
    return this.request<T>({ ...config, url, method: 'POST', data });
  }

  put<T = any>(url: string, data?: any, config: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> = {}) {
    return this.request<T>({ ...config, url, method: 'PUT', data });
  }

  patch<T = any>(url: string, data?: any, config: Omit<SmartApiRequestConfig, 'url' | 'method' | 'data'> = {}) {
    return this.request<T>({ ...config, url, method: 'PATCH', data });
  }

  delete<T = any>(url: string, config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}) {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  head<T = any>(url: string, config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}) {
    return this.request<T>({ ...config, url, method: 'HEAD' });
  }

  options<T = any>(url: string, config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}) {
    return this.request<T>({ ...config, url, method: 'OPTIONS' });
  }

  /** Fire multiple requests in parallel, resolving all results (Promise.all semantics). */
  parallel<T extends readonly SmartApiRequestConfig[]>(
    requests: [...T]
  ): Promise<SmartApiResponse[]> {
    return Promise.all(requests.map((cfg) => this.request(cfg)));
  }

  /** Fire multiple requests in parallel; never rejects, returns per-item settled results. */
  batch(requests: SmartApiRequestConfig[]): Promise<
    Array<{ success: true; response: SmartApiResponse } | { success: false; error: SmartApiError }>
  > {
    return Promise.all(
      requests.map(async (cfg) => {
        try {
          const response = await this.request(cfg);
          return { success: true as const, response };
        } catch (err) {
          return { success: false as const, error: err as SmartApiError };
        }
      })
    );
  }

  /** Upload a file (or files) as multipart/form-data with optional progress tracking. */
  upload<T = any>(
    url: string,
    files: Record<string, { uri: string; name: string; type: string } | Blob | File>,
    extraFields?: Record<string, any>,
    config: Omit<SmartApiRequestConfig, 'url' | 'method' | 'formData'> = {}
  ) {
    return this.request<T>({
      ...config,
      url,
      method: 'POST',
      formData: { ...extraFields, ...files },
      // Prefer XHR so upload progress events fire.
      transport: config.transport ?? 'xhr',
    });
  }

  /** Download a resource, returning the raw response (blob/text depending on platform). */
  async download(
    url: string,
    config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}
  ): Promise<SmartApiResponse<Blob>> {
    return this.request<Blob>({
      ...config,
      url,
      method: 'GET',
      transport: config.transport ?? (config.onDownloadProgress ? 'xhr' : config.transport),
      fetchOptions: { ...config.fetchOptions },
    });
  }

  // ---------------------------------------------------------------------
  // Core request pipeline
  // ---------------------------------------------------------------------

  async request<T = any>(rawConfig: SmartApiRequestConfig): Promise<SmartApiResponse<T>> {
    let config: SmartApiRequestConfig = {
      method: 'GET',
      timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
      ...rawConfig,
      transport: rawConfig.transport ?? this.config.transport ?? 'auto',
      baseURL: rawConfig.baseURL ?? this.config.baseURL,
      headers: { ...this.config.headers, ...rawConfig.headers },
    };

    // Run request interceptor chain.
    if (!config.skipInterceptors) {
      for (const interceptor of this.requestInterceptors) {
        config = await interceptor(config);
      }
    }

    const cacheConfig = this.cacheManager.resolveConfig(config.cache);
    const cacheKey = cacheConfig.key ?? generateCacheKey(config.method ?? 'GET', config.url, config.params);
    const isGet = (config.method ?? 'GET').toUpperCase() === 'GET';
    const logId = this.requestLog.start(config);

    try {
      // Offline handling: queue mutations, or fall back to cache for reads.
      if (this.config.offline?.enabled) {
        await this.offlineQueue.ready();
        const isOnline = await this.networkMonitor.isOnline();
        if (!isOnline) {
          if (!isGet && this.config.offline.queueMutations) {
            const item = this.offlineQueue.enqueue(config);
            if (this.config.offline.throwOnQueue === false) {
              const queuedResponse: SmartApiResponse<T> = {
                data: undefined as any,
                status: 0,
                headers: {},
                ok: false,
                queued: true,
                config,
              };
              this.requestLog.success(logId, queuedResponse);
              return queuedResponse;
            }
            const queuedError = new SmartApiError({
              code: 'REQUEST_QUEUED_OFFLINE',
              status: 0,
              message:
                'You are offline. This request has been queued and will run automatically when you reconnect.',
              type: 'NETWORK_ERROR',
              details: { queueId: item.id, queueSize: this.offlineQueue.size() },
            });
            this.requestLog.failure(logId, queuedError);
            throw queuedError;
          }
          if (isGet && this.config.offline.fallbackToCache) {
            const cached = await this.cacheManager.get<T>(cacheKey, cacheConfig.storage);
            if (cached !== undefined) {
              const response = this.finalize<T>(cached, config, 200, {}, true);
              this.requestLog.success(logId, response);
              return response;
            }
          }
        }
      }

      // Cache read (cache-first / stale-while-revalidate).
      if (isGet && cacheConfig.enabled && cacheConfig.policy !== 'network-first') {
        const cached = await this.cacheManager.get<T>(cacheKey, cacheConfig.storage);
        if (cached !== undefined) {
          if (cacheConfig.policy === 'stale-while-revalidate') {
            void this.executeWithRetry<T>(config)
              .then(async (res) => {
                await this.cacheManager.set(cacheKey, res.data, cacheConfig.ttl, cacheConfig.storage);
              })
              .catch(() => undefined);
          }
          const response = this.finalize<T>(cached, config, 200, {}, true);
          this.requestLog.success(logId, response);
          return response;
        }
      }

      const response = await this.executeWithRetry<T>(config);

      if (isGet && cacheConfig.enabled) {
        await this.cacheManager.set(cacheKey, response.data, cacheConfig.ttl, cacheConfig.storage);
      }

      // Invalidate cached GETs for the same resource after a mutation.
      if (!isGet) {
        const urlRoot = config.url.split('?')[0];
        this.cacheManager.invalidatePrefix(`GET:${urlRoot}`);
        this.queryManager.invalidate(`GET:${urlRoot}`);
        this.queryManager.invalidate(urlRoot);
      }

      this.requestLog.success(logId, response);
      return response;
    } catch (err) {
      if (err instanceof SmartApiError) {
        this.requestLog.failure(logId, err);
      }
      throw err;
    }
  }

  private async executeWithRetry<T>(config: SmartApiRequestConfig): Promise<SmartApiResponse<T>> {
    try {
      return await this.retryManager.execute<SmartApiResponse<T>>(
        () => this.executeOnce<T>(config),
        config.retry ?? this.config.retry
      );
    } catch (err) {
      return this.handleError(err, config);
    }
  }

  private async handleError<T>(err: unknown, config: SmartApiRequestConfig): Promise<SmartApiResponse<T>> {
    let smartError =
      err instanceof SmartApiError
        ? err
        : this.errorEngine.normalize({ raw: err, errorMap: config.errorMap ?? this.config.errorMap });

    // 401 handling: attempt a single-flight token refresh and retry once.
    if (
      smartError.type === 'AUTH_ERROR' &&
      smartError.status === 401 &&
      !config.skipAuth &&
      this.tokenManager.canRefresh()
    ) {
      const newToken = await this.tokenManager.refreshToken();
      if (newToken) {
        try {
          return await this.executeOnce<T>({ ...config, headers: { ...config.headers } });
        } catch (retryErr) {
          smartError =
            retryErr instanceof SmartApiError
              ? retryErr
              : this.errorEngine.normalize({ raw: retryErr });
        }
      } else {
        await this.tokenManager.handleUnauthorized();
      }
    }

    for (const interceptor of this.errorInterceptors) {
      const result = await interceptor(smartError);
      if (!(result instanceof SmartApiError)) {
        return result as SmartApiResponse<T>;
      }
      smartError = result;
    }

    this.logger.error(`Request failed: ${config.method} ${config.url}`, smartError.toJSON());
    throw smartError;
  }

  private async executeOnce<T>(config: SmartApiRequestConfig): Promise<SmartApiResponse<T>> {
    const fullUrl = joinUrl(config.baseURL, config.url) + buildQueryString(config.params);
    const controller = new AbortController();
    const timeoutId = config.timeout
      ? setTimeout(() => controller.abort(), config.timeout)
      : undefined;

    if (config.signal) {
      config.signal.addEventListener('abort', () => controller.abort());
    }

    const { body, headers: bodyHeaders } = this.buildBody(config);
    const headers = { ...bodyHeaders, ...config.headers };
    const transport: TransportType = config.transport ?? this.config.transport ?? 'auto';
    const useXhr = shouldUseXhr(transport, config);

    try {
      if (useXhr) {
        return await this.executeWithXhr<T>(fullUrl, config, headers, body, controller.signal);
      }
      return await this.executeWithFetch<T>(fullUrl, config, headers, body, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) {
        throw this.errorEngine.normalize({ aborted: true });
      }
      throw err instanceof SmartApiError ? err : this.errorEngine.normalize({ raw: err });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executeWithFetch<T>(
    fullUrl: string,
    config: SmartApiRequestConfig,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    signal: AbortSignal
  ): Promise<SmartApiResponse<T>> {
    const fetchInit: RequestInit = {
      method: config.method ?? 'GET',
      headers,
      body,
      signal,
      ...config.fetchOptions,
    };

    const rawResponse = await fetch(fullUrl, fetchInit);

    const responseHeaders: Record<string, string> = {};
    rawResponse.headers.forEach((value: string, key: string) => {
      responseHeaders[key] = value;
    });

    const parsedBody = await this.parseBody(rawResponse);

    if (!rawResponse.ok) {
      throw this.errorEngine.normalize({
        status: rawResponse.status,
        body: parsedBody,
        errorMap: config.errorMap ?? this.config.errorMap,
      });
    }

    return this.runResponseInterceptors(
      this.buildResponse<T>(parsedBody, config, rawResponse.status, responseHeaders),
      config
    );
  }

  private async executeWithXhr<T>(
    fullUrl: string,
    config: SmartApiRequestConfig,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    signal: AbortSignal
  ): Promise<SmartApiResponse<T>> {
    const wantsBlob = !!(config.onDownloadProgress || config.method === 'GET' && config.fetchOptions);
    const result = await xhrRequest({
      url: fullUrl,
      method: config.method ?? 'GET',
      headers,
      body,
      timeout: config.timeout,
      signal,
      responseType: wantsBlob ? 'blob' : 'text',
      onUploadProgress: config.onUploadProgress,
      onDownloadProgress: config.onDownloadProgress,
    });

    if (config.onUploadProgress) config.onUploadProgress(100);
    if (config.onDownloadProgress) config.onDownloadProgress(100);

    const parsedBody = this.parseXhrBody(result.bodyText, result.headers, result.raw);

    if (result.status < 200 || result.status >= 300) {
      throw this.errorEngine.normalize({
        status: result.status,
        body: parsedBody,
        errorMap: config.errorMap ?? this.config.errorMap,
      });
    }

    return this.runResponseInterceptors(
      this.buildResponse<T>(parsedBody, config, result.status, result.headers),
      config
    );
  }

  private async runResponseInterceptors<T>(
    response: SmartApiResponse<T>,
    config: SmartApiRequestConfig
  ): Promise<SmartApiResponse<T>> {
    if (config.skipInterceptors) return response;
    let current = response;
    for (const interceptor of this.responseInterceptors) {
      current = (await interceptor(current)) as SmartApiResponse<T>;
    }
    return current;
  }

  private buildBody(config: SmartApiRequestConfig): { body?: BodyInit; headers: Record<string, string> } {
    if (config.formData) {
      const form =
        typeof FormData !== 'undefined' && config.formData instanceof FormData
          ? config.formData
          : createFormData(config.formData);
      return { body: form, headers: {} };
    }

    if (config.data === undefined || config.data === null) {
      return { body: undefined, headers: {} };
    }

    if (isPlainObject(config.data) || Array.isArray(config.data)) {
      return {
        body: JSON.stringify(config.data),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    return { body: config.data, headers: {} };
  }

  private async parseBody(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }
      if (contentType.includes('text/')) {
        return response.text();
      }
      if (typeof (response as any).blob === 'function') {
        return response.blob();
      }
      return response.text();
    } catch (err) {
      throw this.errorEngine.normalize({ raw: err });
    }
  }

  private parseXhrBody(
    bodyText: string,
    headers: Record<string, string>,
    raw: any
  ): any {
    const contentType = headers['content-type'] ?? '';
    try {
      if (raw && typeof raw !== 'string' && (contentType.includes('octet-stream') || contentType.includes('image/') || contentType.includes('pdf'))) {
        return raw;
      }
      if (contentType.includes('application/json')) {
        return bodyText ? JSON.parse(bodyText) : null;
      }
      if (contentType.includes('text/')) {
        return bodyText;
      }
      if (raw && typeof Blob !== 'undefined' && raw instanceof Blob) {
        return raw;
      }
      if (bodyText) {
        try {
          return JSON.parse(bodyText);
        } catch {
          return bodyText;
        }
      }
      return raw ?? null;
    } catch (err) {
      throw this.errorEngine.normalize({ raw: err });
    }
  }

  private buildResponse<T>(
    rawData: any,
    config: SmartApiRequestConfig,
    status: number,
    headers: Record<string, string>
  ): SmartApiResponse<T> {
    const selected = selectData(rawData, config.select);
    const transformed = applyTransform<any, T>(selected, config.transform as any);

    return {
      data: transformed,
      status,
      headers,
      ok: status >= 200 && status < 300,
      fromCache: false,
      config,
    };
  }

  private finalize<T>(
    data: T,
    config: SmartApiRequestConfig,
    status: number,
    headers: Record<string, string>,
    fromCache: boolean
  ): SmartApiResponse<T> {
    return { data, status, headers, ok: true, fromCache, config };
  }

  /** Cleanup listeners (call on app teardown / test cleanup). */
  destroy(): void {
    this.networkMonitor.destroy();
    this.queryManager.destroy();
  }
}
