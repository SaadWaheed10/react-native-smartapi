import { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiConfig, SmartApiRequestConfig } from '../core/types';

export type MockHandler = {
  /** HTTP method to match. Default: any. */
  method?: string;
  /** Exact path or RegExp matched against the request URL (path + query). */
  url: string | RegExp;
  /** Status code. Default: 200. */
  status?: number;
  /** JSON / text body returned to the client. */
  body?: any;
  /** Response headers. */
  headers?: Record<string, string>;
  /** Optional delay in ms before resolving. */
  delayMs?: number;
  /** Custom handler — overrides status/body when provided. */
  handler?: (config: SmartApiRequestConfig, fullUrl: string) =>
    | { status?: number; body?: any; headers?: Record<string, string> }
    | Promise<{ status?: number; body?: any; headers?: Record<string, string> }>;
};

export interface CreateTestClientOptions extends SmartApiConfig {
  handlers?: MockHandler[];
}

export interface TestClient extends SmartApiClient {
  /** Replace mock handlers at runtime. */
  setHandlers: (handlers: MockHandler[]) => void;
  /** Restore the previous `global.fetch` implementation. */
  restoreFetch: () => void;
}

/**
 * Create a SmartApiClient wired to a mocked `fetch` for unit/integration tests.
 *
 *   const api = createTestClient({
 *     baseURL: 'https://api.test',
 *     handlers: [
 *       { method: 'GET', url: '/users', body: [{ id: 1 }] },
 *       { method: 'POST', url: /\/users$/, status: 201, body: { id: 2 } },
 *     ],
 *   });
 */
export function createTestClient(options: CreateTestClientOptions = {}): TestClient {
  const { handlers: initialHandlers = [], ...config } = options;
  let handlers = [...initialHandlers];
  const previousFetch = (globalThis as any).fetch;

  (globalThis as any).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const fullUrl = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    const match = handlers.find((h) => {
      const methodOk = !h.method || h.method.toUpperCase() === method;
      const urlOk =
        typeof h.url === 'string'
          ? fullUrl.includes(h.url)
          : h.url.test(fullUrl);
      return methodOk && urlOk;
    });

    if (!match) {
      return {
        ok: false,
        status: 404,
        headers: headerBag({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ message: `No mock handler for ${method} ${fullUrl}` }),
      };
    }

    if (match.delayMs) {
      await new Promise((r) => setTimeout(r, match.delayMs));
    }

    let status = match.status ?? 200;
    let body = match.body ?? null;
    let headers = { 'content-type': 'application/json', ...match.headers };

    if (match.handler) {
      const result = await match.handler(
        { url: fullUrl, method: method as any, ...(init as any) },
        fullUrl
      );
      status = result.status ?? status;
      body = result.body !== undefined ? result.body : body;
      headers = { ...headers, ...result.headers };
    }

    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: headerBag(headers),
      text: async () => bodyText,
      blob: async () =>
        typeof Blob !== 'undefined'
          ? new Blob([bodyText])
          : (bodyText as any),
    };
  });

  const client = new SmartApiClient({
    attachDeviceHeaders: false,
    logger: { enabled: false },
    ...config,
  }) as TestClient;

  client.setHandlers = (next) => {
    handlers = [...next];
  };

  client.restoreFetch = () => {
    (globalThis as any).fetch = previousFetch;
  };

  return client;
}

function headerBag(headers: Record<string, string>) {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    normalized[k.toLowerCase()] = v;
  });
  return {
    get: (key: string) => normalized[key.toLowerCase()] ?? null,
    forEach: (cb: (value: string, key: string) => void) => {
      Object.entries(normalized).forEach(([k, v]) => cb(v, k));
    },
  };
}
