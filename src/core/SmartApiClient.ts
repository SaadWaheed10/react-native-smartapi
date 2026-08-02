import type {
  ErrorInterceptor,
  RequestInterceptor,
  ResponseInterceptor,
  SmartApiConfig,
  SmartApiRequestConfig,
  SmartApiResponse,
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

const DEFAULT_TIMEOUT = 30000;

export class SmartApiClient {
  private config: SmartApiConfig;
  private errorEngine: ErrorEngine;
  private cacheManager: CacheManager;
  private retryManager: RetryManager;
  private tokenManager: TokenManager;
  private networkMonitor: NetworkMonitor;
  private offlineQueue: OfflineQueue;
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
    this.offlineQueue = new OfflineQueue(this.networkMonitor);
    this.offlineQueue.setFlusher((cfg) => this.request(cfg));

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

  get cache(): CacheManager {
    return this.cacheManager;
  }

  get offline(): OfflineQueue {
    return this.offlineQueue;
  }

  get network(): NetworkMonitor {
    return this.networkMonitor;
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
    });
  }

  /** Download a resource, returning the raw response (blob/text depending on platform). */
  async download(
    url: string,
    config: Omit<SmartApiRequestConfig, 'url' | 'method'> = {}
  ): Promise<SmartApiResponse<Blob>> {
    return this.request<Blob>({ ...config, url, method: 'GET', fetchOptions: { ...config.fetchOptions } });
  }

  // ---------------------------------------------------------------------
  // Core request pipeline
  // ---------------------------------------------------------------------

  async request<T = any>(rawConfig: SmartApiRequestConfig): Promise<SmartApiResponse<T>> {
    let config: SmartApiRequestConfig = {
      method: 'GET',
      timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
      ...rawConfig,
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

    // Offline handling: queue mutations, or fall back to cache for reads.
    if (this.config.offline?.enabled) {
      const isOnline = await this.networkMonitor.isOnline();
      if (!isOnline) {
        if (!isGet && this.config.offline.queueMutations) {
          this.offlineQueue.enqueue(config);
          throw new SmartApiError({
            code: 'REQUEST_QUEUED_OFFLINE',
            status: 0,
            message: 'You are offline. This request has been queued and will run automatically when you reconnect.',
            type: 'NETWORK_ERROR',
          });
        }
        if (isGet && this.config.offline.fallbackToCache) {
          const cached = await this.cacheManager.get<T>(cacheKey, cacheConfig.storage);
          if (cached !== undefined) {
            return this.finalize<T>(cached, config, 200, {}, true);
          }
        }
      }
    }

    // Cache read (cache-first / stale-while-revalidate).
    if (isGet && cacheConfig.enabled && cacheConfig.policy !== 'network-first') {
      const cached = await this.cacheManager.get<T>(cacheKey, cacheConfig.storage);
      if (cached !== undefined) {
        if (cacheConfig.policy === 'stale-while-revalidate') {
          // Return cached immediately, refresh in background.
          void this.executeWithRetry<T>(config).then(async (res) => {
            await this.cacheManager.set(cacheKey, res.data, cacheConfig.ttl, cacheConfig.storage);
          }).catch(() => undefined);
        }
        return this.finalize<T>(cached, config, 200, {}, true);
      }
    }

    const response = await this.executeWithRetry<T>(config);

    if (isGet && cacheConfig.enabled) {
      await this.cacheManager.set(cacheKey, response.data, cacheConfig.ttl, cacheConfig.storage);
    }

    // Invalidate cached GETs for the same resource root after a mutation.
    if (!isGet) {
      this.cacheManager.invalidatePrefix(`${(config.method ?? 'GET').toUpperCase()}`);
      this.cacheManager.invalidatePrefix(`GET:${config.url.split('?')[0]}`);
    }

    return response;
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
        // An error interceptor recovered the request with a synthetic response.
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

    const fetchInit: RequestInit = {
      method: config.method ?? 'GET',
      headers: { ...bodyHeaders, ...config.headers },
      body,
      signal: controller.signal,
      ...config.fetchOptions,
    };

    let rawResponse: Response;
    try {
      rawResponse = await fetch(fullUrl, fetchInit);
    } catch (err) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        throw this.errorEngine.normalize({ aborted: true });
      }
      throw this.errorEngine.normalize({ raw: err });
    }
    clearTimeout(timeoutId);

    const headers: Record<string, string> = {};
    rawResponse.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const parsedBody = await this.parseBody(rawResponse);

    if (!rawResponse.ok) {
      throw this.errorEngine.normalize({
        status: rawResponse.status,
        body: parsedBody,
        errorMap: config.errorMap ?? this.config.errorMap,
      });
    }

    let response = this.buildResponse<T>(parsedBody, config, rawResponse.status, headers);

    if (!config.skipInterceptors) {
      for (const interceptor of this.responseInterceptors) {
        response = (await interceptor(response)) as SmartApiResponse<T>;
      }
    }

    return response;
  }

  private buildBody(config: SmartApiRequestConfig): { body?: BodyInit; headers: Record<string, string> } {
    if (config.formData) {
      const form = new FormData();
      Object.entries(config.formData).forEach(([key, value]) => {
        // React Native file shape: { uri, name, type }
        form.append(key, value as any);
      });
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
      // Binary / blob fallback (downloads, images, etc).
      if (typeof (response as any).blob === 'function') {
        return response.blob();
      }
      return response.text();
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
  }
}
