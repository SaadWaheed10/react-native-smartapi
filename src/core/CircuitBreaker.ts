import { SmartApiError } from './types';

export interface CircuitBreakerConfig {
  /** Failures before opening the circuit. Default: 5. */
  threshold?: number;
  /** Milliseconds to wait before allowing a trial request. Default: 30000. */
  cooldownMs?: number;
  /** Optional fallback data when the circuit is open. */
  fallback?: any | (() => any);
}

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Simple circuit breaker — after N consecutive failures, short-circuit
 * requests for a cooldown window instead of hammering a dying API.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: CircuitState = 'closed';
  private config: Required<Omit<CircuitBreakerConfig, 'fallback'>> & {
    fallback?: CircuitBreakerConfig['fallback'];
  };

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 5,
      cooldownMs: config.cooldownMs ?? 30_000,
      fallback: config.fallback,
    };
  }

  updateConfig(config: CircuitBreakerConfig): void {
    this.config = {
      threshold: config.threshold ?? this.config.threshold,
      cooldownMs: config.cooldownMs ?? this.config.cooldownMs,
      fallback: config.fallback !== undefined ? config.fallback : this.config.fallback,
    };
  }

  getState(): CircuitState {
    this.refreshState();
    return this.state;
  }

  /** Throws CIRCUIT_OPEN when the breaker is open (unless fallback is set). */
  beforeRequest(): { allow: true } | { allow: false; fallback?: any } {
    this.refreshState();
    if (this.state === 'open') {
      const fallback =
        typeof this.config.fallback === 'function'
          ? this.config.fallback()
          : this.config.fallback;
      if (fallback !== undefined) {
        return { allow: false, fallback };
      }
      throw new SmartApiError({
        code: 'CIRCUIT_OPEN',
        status: 0,
        message: 'Service temporarily unavailable. Please try again shortly.',
        type: 'NETWORK_ERROR',
        details: { cooldownMs: this.config.cooldownMs },
      });
    }
    return { allow: true };
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.config.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  private refreshState(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.config.cooldownMs) {
      this.state = 'half-open';
    }
  }
}
