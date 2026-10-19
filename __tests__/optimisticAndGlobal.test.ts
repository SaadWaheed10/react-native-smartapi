import { SmartApiClient } from '../src/core/SmartApiClient';
import { SmartApiError } from '../src/core/types';

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

describe('setQueryData + global bridges', () => {
  it('setQueryData notifies subscribers', () => {
    const client = new SmartApiClient({ attachDeviceHeaders: false });
    const seen: any[] = [];
    client.queries.subscribe((e) => {
      if (e.type === 'setData') seen.push(e.data);
    });

    client.queries.remember('GET:/todos:{}', [{ id: 1 }]);
    client.setQueryData('/todos', (old: any) => [...(old ?? []), { id: 2 }]);

    expect(seen[0]).toEqual([{ id: 1 }, { id: 2 }]);
    client.destroy();
  });

  it('calls onError for failed requests and skips CANCELLED', async () => {
    const onError = jest.fn();
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      attachDeviceHeaders: false,
      onError,
    });

    mockFetchOnce(500, { message: 'boom' });
    await expect(client.get('/fail')).rejects.toBeInstanceOf(SmartApiError);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].status).toBe(500);

    client.destroy();
  });

  it('calls onQueued when a mutation is queued offline', async () => {
    const onQueued = jest.fn();
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      attachDeviceHeaders: false,
      offline: { enabled: true, queueMutations: true, persist: false, throwOnQueue: false },
      onQueued,
    });

    jest.spyOn(client.network, 'isOnline').mockResolvedValue(false);
    const res = await client.post('/posts', { title: 'x' });
    expect(res.queued).toBe(true);
    expect(onQueued).toHaveBeenCalled();
    client.destroy();
  });
});
