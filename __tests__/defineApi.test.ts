import { defineApi, interpolateUrl } from '../src/core/defineApi';
import { createTestClient } from '../src/testing';

describe('defineApi', () => {
  it('interpolates path params', () => {
    expect(interpolateUrl('/users/:id', { id: 42 })).toBe('/users/42');
    expect(interpolateUrl('/users/{id}/posts/{postId}', { id: 1, postId: 9 })).toBe(
      '/users/1/posts/9'
    );
  });

  it('builds callable typed endpoints', async () => {
    const client = createTestClient({
      baseURL: 'https://api.test',
      handlers: [
        { method: 'GET', url: '/users', body: [{ id: 1 }] },
        { method: 'GET', url: '/users/7', body: { id: 7, name: 'Ada' } },
        { method: 'POST', url: '/users', status: 201, body: { id: 2 } },
      ],
    });

    const usersApi = defineApi(
      {
        list: { method: 'GET', url: '/users' },
        get: { method: 'GET', url: '/users/:id' },
        create: { method: 'POST', url: '/users' },
      },
      { client }
    );

    const list = await usersApi.list();
    expect(list.data).toEqual([{ id: 1 }]);

    const one = await usersApi.get({ pathParams: { id: 7 } });
    expect(one.data).toEqual({ id: 7, name: 'Ada' });

    const created = await usersApi.create({ data: { name: 'Grace' } });
    expect(created.status).toBe(201);

    expect(usersApi.get.$url).toBe('/users/:id');
    expect(usersApi.get.buildUrl({ id: 7 })).toBe('/users/7');
    expect(usersApi.list.$key()).toContain('GET:/users');

    client.restoreFetch();
  });
});
