import { delay } from '../utils/helpers';
import { SmartApiError } from '../core/types';
import type { RetryConfig } from '../core/types';

const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];

type ResolvedRetryConfig = Required<
  Pick<RetryConfig, 'enabled' | 'attempts' | 'baseDelayMs' | 'maxDelayMs' | 'retryStatusCodes'>
> & {
  retryCondition?: RetryConfig['retryCondition'];
};

export class RetryManager {
  private globalConfig: ResolvedRetryConfig;

  constructor(globalConfig: RetryConfig = {}) {
    this.globalConfig = {
      enabled: globalConfig.enabled ?? false,
      attempts: globalConfig.attempts ?? 3,
      baseDelayMs: globalConfig.baseDelayMs ?? 300,
      maxDelayMs: globalConfig.maxDelayMs ?? 8000,
      retryStatusCodes: globalConfig.retryStatusCodes ?? DEFAULT_RETRY_STATUS_CODES,
      retryCondition: globalConfig.retryCondition,
    };
  }

  private resolveConfig(perRequest?: RetryConfig | boolean): ResolvedRetryConfig {
    if (perRequest === false) return { ...this.globalConfig, enabled: false };
    if (perRequest === true) return { ...this.globalConfig, enabled: true };
    if (!perRequest) return this.globalConfig;
    return {
      enabled: perRequest.enabled ?? this.globalConfig.enabled,
      attempts: perRequest.attempts ?? this.globalConfig.attempts,
      baseDelayMs: perRequest.baseDelayMs ?? this.globalConfig.baseDelayMs,
      maxDelayMs: perRequest.maxDelayMs ?? this.globalConfig.maxDelayMs,
      retryStatusCodes: perRequest.retryStatusCodes ?? this.globalConfig.retryStatusCodes,
      retryCondition: perRequest.retryCondition ?? this.globalConfig.retryCondition,
    };
  }

  private computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exponential = baseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.random() * baseDelayMs;
    return Math.min(exponential + jitter, maxDelayMs);
  }

  private defaultShouldRetry(
    error: SmartApiError,
    retryStatusCodes: number[]
  ): boolean {
    if (error.type === 'CANCELLED') return false;
    if (error.type === 'NETWORK_ERROR' || error.type === 'TIMEOUT_ERROR') return true;
    if (error.type === 'HTTP_ERROR' && retryStatusCodes.includes(error.status)) return true;
    return false;
  }

  /**
   * Executes `operation`, retrying on failure per the resolved retry config.
   * `operation` should throw a SmartApiError on failure.
   */
  async execute<T>(operation: (attempt: number) => Promise<T>, perRequest?: RetryConfig | boolean): Promise<T> {
    const config = this.resolveConfig(perRequest);

    if (!config.enabled) {
      return operation(0);
    }

    let lastError: SmartApiError | undefined;

    for (let attempt = 0; attempt <= config.attempts; attempt++) {
      try {
        return await operation(attempt);
      } catch (err) {
        lastError = err as SmartApiError;
        const isLastAttempt = attempt === config.attempts;
        const shouldRetry = config.retryCondition
          ? config.retryCondition(lastError, attempt)
          : this.defaultShouldRetry(lastError, config.retryStatusCodes);

        if (isLastAttempt || !shouldRetry) {
          throw lastError;
        }

        const waitMs = this.computeDelay(attempt + 1, config.baseDelayMs, config.maxDelayMs);
        await delay(waitMs);
      }
    }

    // Unreachable, but keeps TypeScript happy.
    throw lastError;
  }
}
