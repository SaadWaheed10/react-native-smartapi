import type { SmartApiRequestConfig, SmartApiResponse } from './types';

export type MockHandlerResult =
  | any
  | {
      status?: number;
      data?: any;
      headers?: Record<string, string>;
    };

export type MockHandlerFn = (
  config: SmartApiRequestConfig
) => MockHandlerResult | Promise<MockHandlerResult>;

export interface MockConfig {
  /** Enable mock mode (typically `__DEV__`). Default: false. */
  enabled?: boolean;
  /** Artificial latency in ms. Default: 300. */
  delay?: number;
  /**
   * Map of `"METHOD /path"` → body or handler.
   * Path may include `:id` placeholders. Examples:
   *   'GET /users'
   *   'GET /users/:id'
   *   'POST /users'
   */
  handlers?: Record<string, MockHandlerResult | MockHandlerFn>;
}

/**
 * Try to resolve a mock response for the given request.
 * Returns `null` when no handler matches (caller should hit the network).
 */
export async function resolveMockResponse<T>(
  config: SmartApiRequestConfig,
  mock: MockConfig | undefined
): Promise<SmartApiResponse<T> | null> {
  if (!mock?.enabled || !mock.handlers) return null;

  const method = (config.method ?? 'GET').toUpperCase();
  const path = stripQuery(config.url);
  const match = findHandler(mock.handlers, method, path);
  if (!match) return null;

  const delayMs = mock.delay ?? 300;
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const raw =
    typeof match.handler === 'function'
      ? await (match.handler as MockHandlerFn)(config)
      : match.handler;

  const normalized =
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    ('data' in raw || 'status' in raw)
      ? (raw as { status?: number; data?: any; headers?: Record<string, string> })
      : { data: raw, status: 200 };

  const status = normalized.status ?? 200;
  const data = ('data' in normalized ? normalized.data : normalized) as T;

  if (status < 200 || status >= 300) {
    const err: any = new Error(
      typeof data === 'object' && data && 'message' in (data as any)
        ? String((data as any).message)
        : `Mock error ${status}`
    );
    err.__smartApiMock = { status, body: data };
    throw err;
  }

  return {
    data,
    status,
    headers: { 'content-type': 'application/json', 'x-smartapi-mock': '1', ...normalized.headers },
    ok: true,
    fromCache: false,
    config,
  };
}

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function findHandler(
  handlers: Record<string, MockHandlerResult | MockHandlerFn>,
  method: string,
  path: string
): { handler: MockHandlerResult | MockHandlerFn } | null {
  // Exact key first: "GET /users"
  const exact = handlers[`${method} ${path}`];
  if (exact !== undefined) return { handler: exact };

  // Pattern keys: "GET /users/:id"
  for (const key of Object.keys(handlers)) {
    const space = key.indexOf(' ');
    if (space === -1) continue;
    const keyMethod = key.slice(0, space).toUpperCase();
    const keyPath = key.slice(space + 1);
    if (keyMethod !== method) continue;
    if (matchPath(keyPath, path)) {
      return { handler: handlers[key] };
    }
  }

  // Method-agnostic fallback: "/users"
  if (handlers[path] !== undefined) return { handler: handlers[path] };

  return null;
}

function matchPath(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  for (let i = 0; i < patternParts.length; i += 1) {
    const pp = patternParts[i];
    if (pp.startsWith(':') || (pp.startsWith('{') && pp.endsWith('}'))) continue;
    if (pp !== pathParts[i]) return false;
  }
  return true;
}
