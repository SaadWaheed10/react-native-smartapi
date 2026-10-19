import { SmartApiClient } from '../src/core/SmartApiClient';
import { isTimeoutError } from '../src/core/types';

describe('timeout UX', () => {
  it('surfaces TIMEOUT_ERROR with a custom timeoutMessage', async () => {
    (global as any).fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const client = new SmartApiClient({
      baseURL: 'https://api.test',
      attachDeviceHeaders: false,
      timeout: 20,
    });

    await expect(
      client.get('/slow', { timeoutMessage: 'Still working… try again' })
    ).rejects.toMatchObject({
      type: 'TIMEOUT_ERROR',
      code: 'TIMEOUT',
      message: 'Still working… try again',
      isTimeout: true,
    });

    try {
      await client.get('/slow', { timeout: 20 });
    } catch (err) {
      expect(isTimeoutError(err)).toBe(true);
    }

    client.destroy();
  });
});
