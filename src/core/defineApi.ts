import { getDefaultApi } from './config';
import type { SmartApiClient } from './SmartApiClient';
import type { HttpMethod, SmartApiRequestConfig, SmartApiResponse } from './types';
import { QueryManager } from './QueryManager';

export type PathParams = Record<string, string | number>;

export interface EndpointDefinition {
  method?: HttpMethod;
  url: string;
  /** Default query params merged into every call. */
  params?: Record<string, any>;
  /** Default headers merged into every call. */
  headers?: Record<string, string>;
}

export interface EndpointCallOptions
  extends Omit<SmartApiRequestConfig, 'url' | 'method'> {
  /** Values for `:param` placeholders in the endpoint URL. */
  pathParams?: PathParams;
}

export interface DefinedEndpoint<TData = any> {
  /** HTTP method. */
  $method: HttpMethod;
  /** Raw URL template (may contain `:id` placeholders). */
  $url: string;
  /** Resolve the concrete URL with path params. */
  buildUrl: (pathParams?: PathParams) => string;
  /** Stable query/cache key for this endpoint + params. */
  $key: (options?: EndpointCallOptions) => string;
  /** Build a full request config (useful for `api.parallel` / custom calls). */
  toRequest: (options?: EndpointCallOptions) => SmartApiRequestConfig;
  /** Execute the endpoint against the bound client. */
  (options?: EndpointCallOptions): Promise<SmartApiResponse<TData>>;
}

export type DefinedApi<T extends Record<string, EndpointDefinition>> = {
  [K in keyof T]: DefinedEndpoint;
};

export interface DefineApiOptions {
  /** Client used when calling endpoints. Defaults to the shared singleton. */
  client?: SmartApiClient;
}

/**
 * Declare a typed API surface once, then call it from anywhere:
 *
 *   const usersApi = defineApi({
 *     list:   { method: 'GET',  url: '/users' },
 *     get:    { method: 'GET',  url: '/users/:id' },
 *     create: { method: 'POST', url: '/users' },
 *   });
 *
 *   await usersApi.list();
 *   await usersApi.get({ pathParams: { id: 1 } });
 *   await usersApi.create({ data: { name: 'Ada' } });
 *
 *   useGet(usersApi.list);
 *   useGet(usersApi.get, { pathParams: { id: 1 } });
 */
export function defineApi<T extends Record<string, EndpointDefinition>>(
  endpoints: T,
  options: DefineApiOptions = {}
): DefinedApi<T> {
  const api = {} as DefinedApi<T>;

  (Object.keys(endpoints) as Array<keyof T>).forEach((name) => {
    const def = endpoints[name];
    const method = (def.method ?? 'GET').toUpperCase() as HttpMethod;
    const template = def.url;

    const buildUrl = (pathParams?: PathParams) => interpolateUrl(template, pathParams);

    const toRequest = (callOptions: EndpointCallOptions = {}): SmartApiRequestConfig => {
      const { pathParams, params, headers, ...rest } = callOptions;
      return {
        ...rest,
        method,
        url: buildUrl(pathParams),
        params: { ...def.params, ...params },
        headers: { ...def.headers, ...headers },
      };
    };

    const endpoint = (async (callOptions: EndpointCallOptions = {}) => {
      const client = options.client ?? getDefaultApi();
      return client.request(toRequest(callOptions));
    }) as DefinedEndpoint;

    endpoint.$method = method;
    endpoint.$url = template;
    endpoint.buildUrl = buildUrl;
    endpoint.toRequest = toRequest;
    endpoint.$key = (callOptions: EndpointCallOptions = {}) => {
      const req = toRequest(callOptions);
      return QueryManager.keyFrom(req);
    };

    api[name] = endpoint;
  });

  return api;
}

/** True when a value looks like a `defineApi` endpoint descriptor. */
export function isDefinedEndpoint(value: unknown): value is DefinedEndpoint {
  return (
    typeof value === 'function' &&
    typeof (value as DefinedEndpoint).$url === 'string' &&
    typeof (value as DefinedEndpoint).$method === 'string'
  );
}

/** Replace `:id` / `{id}` placeholders in a URL template. */
export function interpolateUrl(template: string, pathParams?: PathParams): string {
  if (!pathParams) return template;
  return template
    .replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
      const value = pathParams[key];
      if (value === undefined || value === null) {
        throw new Error(`Missing path param ":${key}" for URL "${template}"`);
      }
      return encodeURIComponent(String(value));
    })
    .replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => {
      const value = pathParams[key];
      if (value === undefined || value === null) {
        throw new Error(`Missing path param "{${key}}" for URL "${template}"`);
      }
      return encodeURIComponent(String(value));
    });
}
