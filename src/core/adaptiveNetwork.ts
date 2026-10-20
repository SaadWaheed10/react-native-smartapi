export type NetworkQuality = 'offline' | 'slow' | 'ok' | 'fast' | 'unknown';

export interface AdaptiveOverrides {
  timeout: number;
  retryAttempts: number;
  quality: NetworkQuality;
}

/**
 * Derive timeout / retry knobs from NetInfo-ish connection quality.
 * Used when `networkAware: true` is set on the client config.
 */
export function adaptiveOverrides(
  quality: NetworkQuality,
  baseTimeout = 30000
): AdaptiveOverrides {
  switch (quality) {
    case 'offline':
      return { timeout: baseTimeout, retryAttempts: 0, quality };
    case 'slow':
      return { timeout: Math.max(baseTimeout, 45000), retryAttempts: 4, quality };
    case 'fast':
      return { timeout: Math.min(baseTimeout, 12000), retryAttempts: 1, quality };
    case 'ok':
      return { timeout: baseTimeout, retryAttempts: 2, quality };
    default:
      return { timeout: baseTimeout, retryAttempts: 2, quality: 'unknown' };
  }
}

/** Map NetInfo state → coarse quality bucket. */
export function qualityFromNetInfoState(state: any): NetworkQuality {
  if (!state) return 'unknown';
  if (state.isConnected === false || state.isInternetReachable === false) {
    return 'offline';
  }

  const type = String(state.type ?? '').toLowerCase();
  const gen = state.details?.cellularGeneration;

  if (type === 'wifi' || type === 'ethernet' || type === 'vpn') return 'fast';
  if (gen === '5g' || gen === '4g') return 'ok';
  if (gen === '3g' || gen === '2g') return 'slow';
  if (type === 'cellular') return 'ok';
  return 'unknown';
}
