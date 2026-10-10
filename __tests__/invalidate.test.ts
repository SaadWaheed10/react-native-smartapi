import { SmartApiClient } from '../src/core/SmartApiClient';

function mockFetchOnce(status: number, body: any) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => 'application/json',
      forEach: (cb: (value: string, key: string) => void) => {
        cb('application/json', 'content-type');
      },
    },
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('SmartApiClient.invalidate', () => {
  it('clears matching cache entries and notifies query subscribers', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      cache: { enabled: true, ttl: 60000 },
      attachDeviceHeaders: false,
    });

    mockFetchOnce(200, { value: 1 });
    await client.get('/users');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Cache hit
    await client.get('/users');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const events: any[] = [];
    client.queries.subscribe((e) => events.push(e));
    client.invalidate('/users');

    expect(events.length).toBeGreaterThan(0);

    mockFetchOnce(200, { value: 2 });
    const res = await client.get('/users');
    expect(res.data).toEqual({ value: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    client.destroy();
  });

  it('queues mutations offline and exposes queue details', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      offline: { enabled: true, queueMutations: true, persist: false },
      attachDeviceHeaders: false,
    });

    jest.spyOn(client.network, 'isOnline').mockResolvedValue(false);

    await expect(client.post('/posts', { title: 'offline' })).rejects.toMatchObject({
      code: 'REQUEST_QUEUED_OFFLINE',
    });
    expect(client.offline.size()).toBe(1);

    client.destroy();
  });

  it('returns queued response when throwOnQueue is false', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      offline: { enabled: true, queueMutations: true, persist: false, throwOnQueue: false },
      attachDeviceHeaders: false,
    });

    jest.spyOn(client.network, 'isOnline').mockResolvedValue(false);
    const res = await client.post('/posts', { title: 'offline' });
    expect(res.queued).toBe(true);
    expect(res.ok).toBe(false);
    expect(client.offline.size()).toBe(1);

    client.destroy();
  });
});
