import { SmartApiClient } from '../src/core/SmartApiClient';

describe('mock mode', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('returns mocked data without hitting fetch', async () => {
    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      attachDeviceHeaders: false,
      mock: {
        enabled: true,
        delay: 0,
        handlers: {
          'GET /users': [{ id: 1, name: 'Ada' }],
          'GET /users/:id': (cfg: { url: string }) => ({
            id: Number(cfg.url.split('/').pop()),
            name: 'Ada',
          }),
        },
      },
    });

    const list = await client.get('/users');
    expect(list.data).toEqual([{ id: 1, name: 'Ada' }]);
    expect(list.headers['x-smartapi-mock']).toBe('1');
    expect(global.fetch).not.toHaveBeenCalled();

    const one = await client.get('/users/42');
    expect(one.data).toEqual({ id: 42, name: 'Ada' });

    client.destroy();
  });

  it('falls through to network when no handler matches', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
        forEach: (cb: (v: string, k: string) => void) => cb('application/json', 'content-type'),
      },
      text: async () => JSON.stringify({ ok: true }),
    });

    const client = new SmartApiClient({
      baseURL: 'https://api.example.com',
      attachDeviceHeaders: false,
      mock: { enabled: true, delay: 0, handlers: {} },
    });

    const res = await client.get('/real');
    expect(res.data).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalled();
    client.destroy();
  });
});
