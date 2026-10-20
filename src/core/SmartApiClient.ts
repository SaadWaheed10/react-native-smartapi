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
import { applyPresets } from './presets';
import { resolveMockResponse } from './mock';
import { validateWithSchema } from './schema';
import { openStream, type StreamOptions, type StreamHandle } from './stream';
import { CircuitBreaker } from './CircuitBreaker';
import { adaptiveOverrides } from './adaptiveNetwork';

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
  private circuitBreaker: CircuitBreaker | null = null;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(rawConfig: SmartApiConfig = {}) {
    const config = applyPresets(rawConfig.presets, rawConfig);
    this.config = config;
    this.logger = new Logger(config.logger);
    this.errorEngine = new ErrorEngine(config.errorMap);
    this.errorEngine.setLocale(config.locale, config.locales);
    this.cacheManager = new CacheManager(config.cache);
    this.retryManager = new RetryManager(config.retry);
    this.tokenManager = new TokenManager(config.auth);
    this.networkMonitor = new NetworkMonitor();
    this.offlineQueue = new OfflineQueue(this.networkMonitor, config.offline);
    this.offlineQueue.setFlusher((cfg) => this.flushWithConflictHandling(cfg));
    this.queryManager = new QueryManager();
    this.requestLog = new RequestLog(!!config.devtools?.enabled);
    this.circuitBreaker = this.createBreaker(config.circuitBreaker);

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

  private createBreaker(
    config: SmartApiConfig['circuitBreaker']
  ): CircuitBreaker | null {
    if (!config) return null;
    if (config === true) return new CircuitBreaker();
    return new CircuitBreaker(config);
  }

  // ---------------------------------------------------------------------
  // Public configuration API
  // ---------------------------------------------------------------------

  configure(partial: Partial<SmartApiConfig>): void {
    const withPresets = partial.presets
      ? applyPresets(partial.presets, partial)
      : partial;
    this.config = deepMerge(this.config, withPresets);
    if (withPresets.auth || partial.auth) {
      this.tokenManager.updateConfig(this.config.auth ?? {});
    }
    if (withPresets.errorMap || partial.errorMap) {
      this.errorEngine.setGlobalErrorMap(this.config.errorMap ?? {});
    }
    if (withPresets.locale || withPresets.locales || partial.locale || partial.locales) {
      this.errorEngine.setLocale(this.config.locale, this.config.locales);
    }
    if (withPresets.logger || partial.logger) {
      this.logger = new Logger(this.config.logger);
    }
    if (withPresets.offline || partial.offline) {
      this.offlineQueue.updateConfig(this.config.offline ?? {});
    }
    if (withPresets.devtools || partial.devtools) {
      this.requestLog.setEnabled(!!this.config.devtools?.enabled);
    }
    if (withPresets.circuitBreaker !== undefined || partial.circuitBreaker !== undefined) {
      this.circuitBreaker = this.createBreaker(this.config.circuitBreaker);
    }
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

  /**
   * Optimistically set query data for active hooks (and the in-memory query store).
   *
   *   api.setQueryData('/todos', (old) => [...(old ?? []), newTodo])
   *   api.setQueryData('GET:/todos', updatedList)
   */
  setQueryData<T = any>(key: string, dataOrUpdater: T | ((old: T | undefined) => T)): void {
    if (typeof dataOrUpdater === 'function') {
      this.queryManager.updateData(key, dataOrUpdater as (old: T | undefined) => T);
      return;
    }
    this.queryManager.setData(key, dataOrUpdater);
  }

  /**
   * Export a shareable request/response timeline for QA / support.
   *
   *   const json = api.exportReplay();
   *   const har = api.exportReplay({ format: 'har' });
   */
  exportReplay(options: { format?: 'json' | 'har'; limit?: number } = {}): string {
    return this.requestLog.exportReplay({
      ...options,
      redact: (value) => this.logger.redact(value),
    });
  }

  /** Flush queued mutations with conflict handling. */
  private async flushWithConflictHandling(cfg: SmartApiRequestConfig): Promise<any> {
    try {
      return await this.request(cfg);
    } catch (err) {
      const error = err as SmartApiError;
      if (error.status === 409 || error.code === 'HTTP_409') {
        const strategy = this.config.offline?.onConflict ?? 'server-wins';
        if (strategy === 'server-wins' || strategy === 'ask') {
          return undefined; // drop queued client change
        }
        if (strategy === 'client-wins') {
          return this.request({
            ...cfg,
            headers: { ...cfg.headers, 'X-Conflict-Resolve': 'client' },
          });
        }
        if (typeof strategy === 'function') {
          return strategy({ config: cfg, error, server: error.details });
        }
      }
      throw err;
    }
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

  /**
   * Open an SSE / chunked stream:
   *
   *   const stream = api.stream('/events', {
   *     parseJson: true,
   *     onMessage: (data) => console.log(data),
   *   });
   *   // later: stream.abort();
   *   await stream.done;
   */
  stream(url: string, options: StreamOptions = {}): StreamHandle {
    return openStream(this.config.baseURL, url, {
      ...options,
      headers: { ...this.config.headers, ...options.headers },
      timeout: options.timeout ?? this.config.timeout,
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

    // Adaptive networking — tune timeout/retry from connection quality.
    if (this.config.networkAware) {
      const quality = await this.networkMonitor.getQuality();
      const adapted = adaptiveOverrides(quality, config.timeout ?? DEFAULT_TIMEOUT);
      config.timeout = adapted.timeout;
      if (config.retry === undefined || config.retry === true) {
        config.retry = {
          enabled: adapted.retryAttempts > 0,
          attempts: adapted.retryAttempts,
        };
      } else if (typeof config.retry === 'object' && config.retry.attempts === undefined) {
        config.retry = { ...config.retry, attempts: adapted.retryAttempts };
      }
    }

    // Circuit breaker gate.
    if (this.circuitBreaker) {
      const gate = this.circuitBreaker.beforeRequest();
      if (!gate.allow) {
        return this.finalize<T>(gate.fallback as T, config, 200, {}, true);
      }
    }

    // Run request interceptor chain.
    if (!config.skipInterceptors) {
      for (const interceptor of this.requestInterceptors) {
        config = await interceptor(config);
      }
    }

    const cacheConfig = this.cacheManager.resolveConfig(config.cache);
    const cacheKey = cacheConfig.key ?? generateCacheKey(config.method ?? 'GET', config.url, config.params);
    const isGet = (config.method ?? 'GET').toUpperCase() === 'GET';

    // ETag conditional request.
    if (isGet && cacheConfig.etag) {
      const etag = this.cacheManager.getEtag(cacheKey);
      if (etag) {
        config.headers = { ...config.headers, 'If-None-Match': etag };
      }
    }

    const logId = this.requestLog.start(config);

    try {
      // Mock layer (UI / offline-dev) — short-circuits the network when matched.
      try {
        const mocked = await resolveMockResponse<T>(config, this.config.mock);
        if (mocked) {
          if (isGet && cacheConfig.enabled) {
            await this.cacheManager.set(cacheKey, mocked.data, cacheConfig.ttl, cacheConfig.storage);
          }
          this.queryManager.remember(cacheKey, mocked.data);
          this.requestLog.success(logId, mocked);
          void this.config.onSuccess?.(mocked);
          return mocked;
        }
      } catch (mockErr: any) {
        if (mockErr?.__smartApiMock) {
          throw this.errorEngine.normalize({
            status: mockErr.__smartApiMock.status,
            body: mockErr.__smartApiMock.body,
            errorMap: config.errorMap ?? this.config.errorMap,
          });
        }
        throw mockErr;
      }

      // Offline handling: queue mutations, or fall back to cache for reads.
      if (this.config.offline?.enabled) {
        await this.offlineQueue.ready();
        const isOnline = await this.networkMonitor.isOnline();
        if (!isOnline) {
          if (!isGet && this.config.offline.queueMutations) {
            const item = this.offlineQueue.enqueue(config);
            void this.config.onQueued?.(config);
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
                this.queryManager.remember(cacheKey, res.data);
              })
              .catch(() => undefined);
          }
          const response = this.finalize<T>(cached, config, 200, {}, true);
          this.queryManager.remember(cacheKey, cached);
          this.requestLog.success(logId, response);
          return response;
        }
      }

      try {
        const response = await this.executeWithRetry<T>(config);

        // HTTP 304 Not Modified → serve cached body.
        if (response.status === 304 && isGet) {
          const cached = await this.cacheManager.get<T>(cacheKey, cacheConfig.storage);
          if (cached !== undefined) {
            const cachedResponse = this.finalize<T>(cached, config, 200, response.headers, true);
            this.circuitBreaker?.recordSuccess();
            this.requestLog.success(logId, cachedResponse);
            return cachedResponse;
          }
        }

        if (isGet && cacheConfig.enabled) {
          await this.cacheManager.set(cacheKey, response.data, cacheConfig.ttl, cacheConfig.storage);
        }

        if (isGet && cacheConfig.etag) {
          const etag = response.headers.etag ?? response.headers.ETag;
          if (etag) this.cacheManager.setEtag(cacheKey, etag);
        }

        if (isGet) {
          this.queryManager.remember(cacheKey, response.data);
        }

        // Invalidate cached GETs for the same resource after a mutation.
        if (!isGet) {
          const urlRoot = config.url.split('?')[0];
          this.cacheManager.invalidatePrefix(`GET:${urlRoot}`);
          this.queryManager.invalidate(`GET:${urlRoot}`);
          this.queryManager.invalidate(urlRoot);
        }

        this.circuitBreaker?.recordSuccess();
        this.requestLog.success(logId, response);
        void this.config.onSuccess?.(response);
        return response;
      } catch (inner) {
        this.circuitBreaker?.recordFailure();
        throw inner;
      }
    } catch (err) {
      if (err instanceof SmartApiError) {
        this.requestLog.failure(logId, err);
        if (err.type !== 'CANCELLED' && err.code !== 'REQUEST_QUEUED_OFFLINE') {
          void this.config.onError?.(err, { config });
        }
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
    let timedOut = false;
    const timeoutId = config.timeout
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, config.timeout)
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
      if (timedOut || (err as any)?.name === 'TimeoutError') {
        throw this.errorEngine.normalize({
          timedOut: true,
          timeoutMessage: config.timeoutMessage,
          raw: err,
        });
      }
      if (controller.signal.aborted) {
        throw this.errorEngine.normalize({ aborted: true });
      }
      throw err instanceof SmartApiError
        ? err
        : this.errorEngine.normalize({
            raw: err,
            timeoutMessage: config.timeoutMessage,
          });
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

    // 304 has empty body — caller serves cache.
    if (rawResponse.status === 304) {
      return {
        data: undefined as any,
        status: 304,
        headers: responseHeaders,
        ok: true,
        fromCache: true,
        config,
      };
    }

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
    const data = validateWithSchema<T>(transformed, config.schema as any);

    return {
      data,
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
