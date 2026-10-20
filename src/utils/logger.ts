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
  'phone',
  'email',
  'cnic',
];

const DEFAULT_VALUE_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // email
  /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // phone-ish
  /\b\d{13,19}\b/, // long numeric (cards)
];

export class Logger {
  private enabled: boolean;
  private maskSensitiveData: boolean;
  private sensitiveKeys: Set<string>;
  private valuePatterns: RegExp[];
  private level: NonNullable<LoggerConfig['level']>;

  constructor(config: LoggerConfig = {}) {
    this.enabled = config.enabled ?? __DEV__ONLY_DEFAULT();
    this.maskSensitiveData = config.maskSensitiveData ?? true;
    const redact = config.redact ?? [];
    const extraKeys = redact.filter((r): r is string => typeof r === 'string');
    const extraPatterns = redact.filter((r): r is RegExp => r instanceof RegExp);
    this.sensitiveKeys = new Set(
      [...DEFAULT_SENSITIVE_KEYS, ...(config.sensitiveKeys ?? []), ...extraKeys].map((k) =>
        k.toLowerCase()
      )
    );
    this.valuePatterns = [...DEFAULT_VALUE_PATTERNS, ...extraPatterns];
    this.level = config.level ?? 'warn';
  }

  /** Redact a value for safe logging / replay export. */
  redact(value: any): any {
    return this.mask(value);
  }

  private mask(value: any, seen = new WeakSet<object>()): any {
    if (!this.maskSensitiveData) return value;
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      let out = value;
      for (const pattern of this.valuePatterns) {
        out = out.replace(pattern, '***REDACTED***');
      }
      return out;
    }

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

function __DEV__ONLY_DEFAULT(): boolean {
  try {
    // eslint-disable-next-line no-undef
    return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  } catch {
    return false;
  }
}
