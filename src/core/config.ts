import { SmartApiClient } from './SmartApiClient';
import type { SmartApiConfig } from './types';

let defaultClient: SmartApiClient | null = null;

/**
 * Creates a new, independent SmartApiClient instance. Use this when you
 * need multiple API clients (e.g. one per backend service).
 */
export function createApi(config: SmartApiConfig = {}): SmartApiClient {
  return new SmartApiClient(config);
}

/**
 * Configures the shared default client singleton (`api`). Call this once,
 * early in your app (e.g. in `App.tsx` or an `apiConfig.ts` file):
 *
 *   import { configureApi } from 'react-native-smartapi';
 *   configureApi({ baseURL: 'https://api.example.com', auth: { getToken } });
 */
export function configureApi(config: SmartApiConfig): SmartApiClient {
  if (!defaultClient) {
    defaultClient = new SmartApiClient(config);
  } else {
    defaultClient.configure(config);
  }
  return defaultClient;
}

/** Returns the shared default client, creating it with empty config if needed. */
export function getDefaultApi(): SmartApiClient {
  if (!defaultClient) {
    defaultClient = new SmartApiClient();
  }
  return defaultClient;
}

/** Lazily-evaluated proxy so `import { api } from 'react-native-smartapi'` always points at the current default client. */
export const api: SmartApiClient = new Proxy({} as SmartApiClient, {
  get(_target, prop: keyof SmartApiClient) {
    const client = getDefaultApi();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
