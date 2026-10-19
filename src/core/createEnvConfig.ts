import type { SmartApiConfig } from './types';
import { deepMerge } from '../utils/helpers';

export type AppEnvironment = 'development' | 'staging' | 'production' | string;

export type EnvConfigMap = Partial<Record<AppEnvironment, Partial<SmartApiConfig>>> & {
  /** Shared defaults applied to every environment first. */
  shared?: Partial<SmartApiConfig>;
};

export interface CreateEnvConfigOptions {
  /**
   * Force an environment. When omitted, resolves from (in order):
   * `EXPO_PUBLIC_APP_ENV`, `APP_ENV`, `NODE_ENV`, then `__DEV__` → development/production.
   */
  env?: AppEnvironment;
}

/**
 * Pick the right SmartAPI config for the current environment:
 *
 *   configureApi(createEnvConfig({
 *     shared: { timeout: 15000 },
 *     development: {
 *       baseURL: 'http://localhost:3000',
 *       mock: { enabled: true, handlers: { 'GET /users': [] } },
 *       presets: ['devLog'],
 *     },
 *     staging: { baseURL: 'https://staging.api.example.com' },
 *     production: {
 *       baseURL: 'https://api.example.com',
 *       logger: { enabled: false },
 *     },
 *   }));
 */
export function createEnvConfig(
  map: EnvConfigMap,
  options: CreateEnvConfigOptions = {}
): SmartApiConfig {
  const env = options.env ?? detectEnvironment();
  const shared = map.shared ?? {};
  const specific = (map[env] ?? map.production ?? map.development ?? {}) as Partial<SmartApiConfig>;
  return deepMerge({ ...shared } as SmartApiConfig, specific);
}

/** Resolve the active app environment name. */
export function detectEnvironment(): AppEnvironment {
  const fromEnv =
    readEnv('EXPO_PUBLIC_APP_ENV') ||
    readEnv('APP_ENV') ||
    readEnv('REACT_NATIVE_APP_ENV');

  if (fromEnv) return fromEnv as AppEnvironment;

  const nodeEnv = readEnv('NODE_ENV');
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'development';

  try {
    // Metro injects __DEV__
    if (typeof __DEV__ !== 'undefined' && __DEV__) return 'development';
  } catch {
    // ignore
  }

  return nodeEnv === 'development' ? 'development' : 'production';
}

function readEnv(key: string): string | undefined {
  try {
    const value = (globalThis as any)?.process?.env?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
