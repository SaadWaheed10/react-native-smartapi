import { createEnvConfig, detectEnvironment } from '../src/core/createEnvConfig';

describe('createEnvConfig', () => {
  it('merges shared + environment-specific config', () => {
    const config = createEnvConfig(
      {
        shared: { timeout: 10000, headers: { 'X-App': '1' } },
        development: {
          baseURL: 'http://localhost:3000',
          mock: { enabled: true },
        },
        production: {
          baseURL: 'https://api.example.com',
          logger: { enabled: false },
        },
      },
      { env: 'development' }
    );

    expect(config.baseURL).toBe('http://localhost:3000');
    expect(config.timeout).toBe(10000);
    expect(config.headers?.['X-App']).toBe('1');
    expect(config.mock?.enabled).toBe(true);
  });

  it('selects production when forced', () => {
    const config = createEnvConfig(
      {
        development: { baseURL: 'http://localhost' },
        production: { baseURL: 'https://prod' },
      },
      { env: 'production' }
    );
    expect(config.baseURL).toBe('https://prod');
  });

  it('detectEnvironment returns a string', () => {
    expect(typeof detectEnvironment()).toBe('string');
  });
});
