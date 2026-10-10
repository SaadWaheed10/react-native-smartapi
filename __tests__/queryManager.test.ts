import { QueryManager } from '../src/core/QueryManager';

describe('QueryManager', () => {
  it('dedupes concurrent requests with the same key', async () => {
    const qm = new QueryManager();
    let calls = 0;

    const factory = () => {
      calls += 1;
      return new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 20));
    };

    const [a, b] = await Promise.all([qm.dedupe('k', factory), qm.dedupe('k', factory)]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(calls).toBe(1);
  });

  it('notifies subscribers on invalidate', () => {
    const qm = new QueryManager();
    const events: any[] = [];
    qm.subscribe((e) => events.push(e));

    qm.invalidate('GET:/users');
    expect(events).toHaveLength(1);
    expect(events[0].prefix).toBe('GET:/users');
  });

  it('matches keys and prefixes', () => {
    expect(QueryManager.matches('GET:/users:{}', { type: 'invalidate', prefix: 'GET:/users' })).toBe(
      true
    );
    expect(QueryManager.matches('GET:/posts:{}', { type: 'invalidate', prefix: 'GET:/users' })).toBe(
      false
    );
    expect(QueryManager.matches('GET:/users:{}', { type: 'invalidate' })).toBe(true);
  });
});
