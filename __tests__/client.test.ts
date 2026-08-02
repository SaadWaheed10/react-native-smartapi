import { SmartApiClient } from '../src/core/SmartApiClient';
import { SmartApiError } from '../src/core/types';

function mockFetchOnce(status: number, body: any, headers: Record<string, string> = {}) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? 'application/json',
      forEach: (cb: (value: string, key: string) => void) => {
        cb(headers['content-type'] ?? 'application/json', 'content-type');
      },
    },
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('SmartApiClient', () => {
  it('performs a basic GET request and returns parsed JSON', async () => {
    const client = new SmartApiClient({ baseURL: 'https://api.example.com' });
    mockFetchOnce(200, { data: { id: 1, name: 'Ada' } });

    const response = await client.get('/users/1');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ data: { id: 1, name: 'Ada' } });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users/1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('extracts nested data via `select`', async () => {
    const client = new SmartApiClient({ baseURL: 'https://api.example.com' });
    mockFetchOnce(200, { data: { profile: { name: 'Ada' } } });

    const response = await client.get('/me', { select: 'data.profile.name' });
    expect(response.data).toBe('Ada');
  });

  it('applies a `transform` function to the response', async () => {
    const client = new SmartApiClient({ baseURL: 'https://api.example.com' });
    mockFetchOnce(200, { data: { users: [{ user_id: 1, full_name: 'Ada' }] } });

    const response = await client.get('/users', {
      select: 'data.users',
      transform: (users: any[]) => users.map((u) => ({ id: u.user_id, name: u.full_name })),
    });

    expect(response.data).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('normalizes HTTP error responses into SmartApiError', async () => {
    const client = new SmartApiClient({ baseURL: 'https://api.example.com' });
    mockFetchOnce(404, { message: 'User not found' });

    await expect(client.get('/users/999')).rejects.toMatchObject({
      status: 404,
      type: 'HTTP_ERROR',
      message: 'User not found',
    });
  });

  it('injects the Authorization header when auth is configured', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      auth: { getToken: () => 'abc123' },
    });
    mockFetchOnce(200, { ok: true });

    await client.get('/secure');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer abc123');
  });

  it('retries on a 500 and eventually succeeds', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      retry: { enabled: true, attempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
    });

    mockFetchOnce(500, { message: 'boom' });
    mockFetchOnce(200, { ok: true });

    const response = await client.get('/flaky');
    expect(response.data).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('serves cached GET responses on the second call', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      cache: { enabled: true, ttl: 60000 },
    });

    mockFetchOnce(200, { value: 42 });

    const first = await client.get('/cached');
    const second = await client.get('/cached');

    expect(first.data).toEqual({ value: 42 });
    expect(second.data).toEqual({ value: 42 });
    expect(second.fromCache).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws a SmartApiError instance on network failure', async () => {
    const client = new SmartApiClient({ baseURL: 'https://api.example.com' });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));

    await expect(client.get('/offline-test')).rejects.toBeInstanceOf(SmartApiError);
  });
});
