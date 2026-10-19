import { applyPresets, withAuth, withCache, withOffline } from '../src/core/presets';
import { SmartApiClient } from '../src/core/SmartApiClient';

describe('presets', () => {
  it('merges named presets then overlays explicit config', () => {
    const config = applyPresets(['json', 'retrySafe', 'cacheShort'], {
      baseURL: 'https://api.test',
      retry: { attempts: 5 },
    });

    expect(config.baseURL).toBe('https://api.test');
    expect(config.headers?.Accept).toBe('application/json');
    expect(config.retry?.enabled).toBe(true);
    expect(config.retry?.attempts).toBe(5);
    expect(config.cache?.enabled).toBe(true);
    expect(config.staleTime).toBe(30_000);
  });

  it('applies presets in SmartApiClient constructor', () => {
    const client = new SmartApiClient({
      presets: ['offlineQueue', 'devLog'],
      attachDeviceHeaders: false,
    });
    const cfg = client.getConfig();
    expect(cfg.offline?.enabled).toBe(true);
    expect(cfg.offline?.persist).toBe(true);
    expect(cfg.devtools?.enabled).toBe(true);
    client.destroy();
  });

  it('helper builders work', () => {
    expect(withAuth({ getToken: () => 't' }).auth?.getToken?.()).toBe('t');
    expect(withCache().cache).toEqual({ enabled: true });
    expect(withOffline().offline?.queueMutations).toBe(true);
  });
});
