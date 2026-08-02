import type { LoggerConfig } from '../core/types';

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'apiKey',
  'api_key',
  'otp',
  'pin',
  'cvv',
  'ssn',
  'creditCard',
  'card_number',
];

export class Logger {
  private enabled: boolean;
  private maskSensitiveData: boolean;
  private sensitiveKeys: Set<string>;
  private level: NonNullable<LoggerConfig['level']>;

  constructor(config: LoggerConfig = {}) {
    this.enabled = config.enabled ?? __DEV__ONLY_DEFAULT();
    this.maskSensitiveData = config.maskSensitiveData ?? true;
    this.sensitiveKeys = new Set(
      [...DEFAULT_SENSITIVE_KEYS, ...(config.sensitiveKeys ?? [])].map((k) => k.toLowerCase())
    );
    this.level = config.level ?? 'warn';
  }

  private mask(value: any, seen = new WeakSet<object>()): any {
    if (!this.maskSensitiveData) return value;
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
      return value.map((v) => this.mask(v, seen));
    }

    if (typeof value === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        if (this.sensitiveKeys.has(key.toLowerCase())) {
          result[key] = '***MASKED***';
        } else {
          result[key] = this.mask(value[key], seen);
        }
      }
      return result;
    }

    return value;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    if (!this.enabled || this.level === 'silent') return false;
    const order = ['debug', 'info', 'warn', 'error'];
    return order.indexOf(level) >= order.indexOf(this.level);
  }

  debug(message: string, payload?: any) {
    if (!this.shouldLog('debug')) return;
    // eslint-disable-next-line no-console
    console.log(`[SmartAPI:debug] ${message}`, payload !== undefined ? this.mask(payload) : '');
  }

  info(message: string, payload?: any) {
    if (!this.shouldLog('info')) return;
    // eslint-disable-next-line no-console
    console.info(`[SmartAPI:info] ${message}`, payload !== undefined ? this.mask(payload) : '');
  }

  warn(message: string, payload?: any) {
    if (!this.shouldLog('warn')) return;
    // eslint-disable-next-line no-console
    console.warn(`[SmartAPI:warn] ${message}`, payload !== undefined ? this.mask(payload) : '');
  }

  error(message: string, payload?: any) {
    if (!this.shouldLog('error')) return;
    // eslint-disable-next-line no-console
    console.error(`[SmartAPI:error] ${message}`, payload !== undefined ? this.mask(payload) : '');
  }
}

// `__DEV__` is a React Native global; guard for non-RN environments (tests/tools).
function __DEV__ONLY_DEFAULT(): boolean {
  try {
    // eslint-disable-next-line no-undef
    return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  } catch {
    return false;
  }
}
