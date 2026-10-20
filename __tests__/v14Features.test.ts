import { SmartApiClient } from '../src/core/SmartApiClient';
import { CircuitBreaker } from '../src/core/CircuitBreaker';
import { adaptiveOverrides, qualityFromNetInfoState } from '../src/core/adaptiveNetwork';
import { defineResource } from '../src/core/defineResource';
import { createTestClient } from '../src/testing';
import { Logger } from '../src/utils/logger';
import { prefetch } from '../src/navigation/prefetchOnFocus';

function mockFetch(status: number, body: any, headers: Record<string, string> = {}) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) =>
        headers[key.toLowerCase()] ?? (key.toLowerCase() === 'content-type' ? 'application/json' : null),
      forEach: (cb: (v: string, k: string) => void) => {
        cb(headers['content-type'] ?? 'application/json', 'content-type');
        Object.entries(headers).forEach(([k, v]) => cb(v, k));
      },
    },
    text: async () => (body === undefined || body === null ? '' : JSON.stringify(body)),
  });
}

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('v1.4 features', () => {
  it('adaptiveOverrides scales timeout by quality', () => {
    expect(adaptiveOverrides('slow', 10000).timeout).toBeGreaterThanOrEqual(45000);
    expect(adaptiveOverrides('fast', 30000).timeout).toBeLessThanOrEqual(12000);
    expect(qualityFromNetInfoState({ type: 'wifi', isConnected: true })).toBe('fast');
    expect(qualityFromNetInfoState({ isConnected: false })).toBe('offline');
  });

  it('circuit breaker opens after threshold failures', () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 60_000 });
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    expect(() => breaker.beforeRequest()).toThrow(/temporarily unavailable/i);
  });

  it('circuit breaker can serve fallback', () => {
    const breaker = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 60_000,
      fallback: { offline: true },
    });
    breaker.recordFailure();
    const gate = breaker.beforeRequest();
    expect(gate.allow).toBe(false);
    if (!gate.allow) expect(gate.fallback).toEqual({ offline: true });
  });

  it('localizes error messages', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));

    const client = new SmartApiClient({
      baseURL: 'https://api.test',
      attachDeviceHeaders: false,
      locale: 'ur',
      locales: { ur: { NO_INTERNET: 'انٹرنیٹ دستیاب نہیں' } },
    });

    await expect(client.get('/x')).rejects.toMatchObject({
      code: 'NO_INTERNET',
      message: 'انٹرنیٹ دستیاب نہیں',
    });
    client.destroy();
  });

  it('redacts sensitive values in logger', () => {
    const logger = new Logger({
      enabled: false,
      redact: ['phone', /\bSECRET\b/],
    });
    const redacted = logger.redact({
      phone: '03001234567',
      note: 'token SECRET here',
      password: 'hunter2',
    });
    expect(redacted.password).toBe('***MASKED***');
    expect(redacted.phone).toBe('***MASKED***');
    expect(String(redacted.note)).toContain('***REDACTED***');
  });

  it('stores ETag and sends If-None-Match', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.test',
      attachDeviceHeaders: false,
      cache: { enabled: true, etag: true, ttl: 60_000, policy: 'network-first' },
    });

    mockFetch(200, { id: 1 }, { etag: '"abc"', 'content-type': 'application/json' });
    await client.get('/item');

    mockFetch(304, null, { etag: '"abc"' });
    const second = await client.get('/item');
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual({ id: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const init = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(init.headers['If-None-Match']).toBe('"abc"');
    client.destroy();
  });

  it('defineResource exposes CRUD helpers', async () => {
    const api = createTestClient({
      baseURL: 'https://api.test',
      handlers: [
        { method: 'GET', url: '/posts', body: [{ id: 1 }] },
        { method: 'POST', url: '/posts', status: 201, body: { id: 2 } },
        { method: 'GET', url: '/posts/1', body: { id: 1, title: 'Hi' } },
      ],
    });

    const posts = defineResource('/posts', { client: api });
    expect((await posts.list()).data).toEqual([{ id: 1 }]);
    expect((await posts.get(1)).data).toEqual({ id: 1, title: 'Hi' });
    expect((await posts.create({ title: 'New' })).status).toBe(201);
    api.restoreFetch();
  });

  it('exportReplay returns JSON with entries', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.test',
      attachDeviceHeaders: false,
      devtools: { enabled: true },
    });
    mockFetch(200, { ok: true });
    await client.get('/ping');
    const replay = JSON.parse(client.exportReplay());
    expect(replay.count).toBeGreaterThan(0);
    expect(replay.entries[0].url).toBe('/ping');
    client.destroy();
  });

  it('prefetch issues a GET', async () => {
    const api = createTestClient({
      baseURL: 'https://api.test',
      handlers: [{ method: 'GET', url: '/prefetch', body: { ok: true } }],
    });
    const res = await prefetch('/prefetch', api);
    expect(res.data).toEqual({ ok: true });
    api.restoreFetch();
  });
});
