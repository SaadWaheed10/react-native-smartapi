import { OfflineQueue } from '../src/offline/OfflineQueue';
import { NetworkMonitor } from '../src/offline/NetworkMonitor';

describe('OfflineQueue', () => {
  it('enqueues mutations and notifies subscribers', async () => {
    const network = new NetworkMonitor();
    const queue = new OfflineQueue(network, { persist: false });
    await queue.ready();

    const snapshots: number[] = [];
    queue.subscribe((items) => snapshots.push(items.length));

    queue.enqueue({ url: '/posts', method: 'POST', data: { title: 'Hi' } });
    expect(queue.size()).toBe(1);
    expect(snapshots[snapshots.length - 1]).toBe(1);

    queue.clear();
    expect(queue.size()).toBe(0);
    network.destroy();
  });

  it('flushes queued requests when online', async () => {
    const network = new NetworkMonitor();
    const queue = new OfflineQueue(network, { persist: false });
    await queue.ready();

    const flushed: string[] = [];
    queue.setFlusher(async (cfg) => {
      flushed.push(cfg.url);
    });

    queue.enqueue({ url: '/a', method: 'POST' });
    queue.enqueue({ url: '/b', method: 'PUT' });
    await queue.flush();

    expect(flushed).toEqual(['/a', '/b']);
    expect(queue.size()).toBe(0);
    network.destroy();
  });

  it('re-queues failed flushes', async () => {
    const network = new NetworkMonitor();
    const queue = new OfflineQueue(network, { persist: false });
    await queue.ready();

    queue.setFlusher(async () => {
      throw new Error('fail');
    });

    queue.enqueue({ url: '/fail', method: 'POST' });
    await queue.flush();
    expect(queue.size()).toBe(1);
    network.destroy();
  });
});
