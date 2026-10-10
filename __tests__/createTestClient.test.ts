import { createTestClient } from '../src/testing';

describe('createTestClient', () => {
  afterEach(() => {
    // restoreFetch is per-client; ensure we don't leak mocks across files.
  });

  it('mocks GET handlers and returns JSON', async () => {
    const api = createTestClient({
      baseURL: 'https://api.test',
      handlers: [{ method: 'GET', url: '/users', body: [{ id: 1, name: 'Ada' }] }],
    });

    const res = await api.get('/users');
    expect(res.data).toEqual([{ id: 1, name: 'Ada' }]);
    api.restoreFetch();
  });

  it('supports custom handler functions', async () => {
    const api = createTestClient({
      baseURL: 'https://api.test',
      handlers: [
        {
          method: 'POST',
          url: '/users',
          handler: () => ({ status: 201, body: { id: 99 } }),
        },
      ],
    });

    const res = await api.post('/users', { name: 'Grace' });
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ id: 99 });
    api.restoreFetch();
  });

  it('returns 404 when no handler matches', async () => {
    const api = createTestClient({ baseURL: 'https://api.test', handlers: [] });
    await expect(api.get('/missing')).rejects.toMatchObject({ status: 404 });
    api.restoreFetch();
  });
});
