import { buildQueryString, getByPath, joinUrl, generateCacheKey } from '../src/utils/helpers';

describe('getByPath', () => {
  it('extracts a nested property', () => {
    const obj = { data: { profile: { name: 'Ada' } } };
    expect(getByPath(obj, 'data.profile.name')).toBe('Ada');
  });

  it('extracts an array', () => {
    const obj = { data: { users: [{ id: 1 }, { id: 2 }] } };
    expect(getByPath(obj, 'data.users')).toHaveLength(2);
  });

  it('returns undefined for a missing path', () => {
    const obj = { data: {} };
    expect(getByPath(obj, 'data.profile.name')).toBeUndefined();
  });

  it('returns the original object when no path given', () => {
    const obj = { a: 1 };
    expect(getByPath(obj)).toBe(obj);
  });

  it('supports array index syntax', () => {
    const obj = { data: { users: [{ name: 'Ada' }] } };
    expect(getByPath(obj, 'data.users[0].name')).toBe('Ada');
  });
});

describe('buildQueryString', () => {
  it('builds a query string from params', () => {
    expect(buildQueryString({ page: 1, limit: 20 })).toBe('?page=1&limit=20');
  });

  it('returns an empty string for no params', () => {
    expect(buildQueryString()).toBe('');
  });

  it('handles arrays', () => {
    expect(buildQueryString({ ids: [1, 2] })).toBe('?ids%5B%5D=1&ids%5B%5D=2');
  });

  it('skips null/undefined values', () => {
    expect(buildQueryString({ a: 1, b: undefined, c: null })).toBe('?a=1');
  });
});

describe('joinUrl', () => {
  it('joins a base URL and relative path', () => {
    expect(joinUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
  });

  it('handles trailing/leading slashes gracefully', () => {
    expect(joinUrl('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
  });

  it('leaves absolute URLs untouched', () => {
    expect(joinUrl('https://api.example.com', 'https://other.com/x')).toBe('https://other.com/x');
  });
});

describe('generateCacheKey', () => {
  it('produces a stable key regardless of params order', () => {
    const key1 = generateCacheKey('GET', '/users', { b: 2, a: 1 });
    const key2 = generateCacheKey('GET', '/users', { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });
});
