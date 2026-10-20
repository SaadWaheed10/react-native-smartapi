import { qualityFromNetInfoState, type NetworkQuality } from '../core/adaptiveNetwork';
import { optionalRequire } from '../utils/helpers';

type Listener = (isOnline: boolean) => void;
type QualityListener = (quality: NetworkQuality) => void;

/**
 * Wraps `@react-native-community/netinfo` (optional peer dependency).
 * If NetInfo isn't installed, this assumes the device is always online —
 * requests will simply surface real network errors as they occur, and
 * offline-queueing features become inert rather than breaking the app.
 */
export class NetworkMonitor {
  private netInfo: any;
  private listeners = new Set<Listener>();
  private qualityListeners = new Set<QualityListener>();
  private currentlyOnline = true;
  private currentQuality: NetworkQuality = 'unknown';
  private unsubscribe: (() => void) | null = null;
  readonly available: boolean;

  constructor() {
    const mod = optionalRequire<any>('@react-native-community/netinfo');
    this.netInfo = mod?.default ?? mod;
    this.available = !!this.netInfo;

    if (this.available) {
      this.unsubscribe = this.netInfo.addEventListener((state: any) => {
        const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
        const quality = qualityFromNetInfoState(state);
        this.currentQuality = quality;

        if (isOnline !== this.currentlyOnline) {
          this.currentlyOnline = isOnline;
          this.listeners.forEach((listener) => listener(isOnline));
        }
        this.qualityListeners.forEach((listener) => listener(quality));
      });
    }
  }

  async isOnline(): Promise<boolean> {
    if (!this.available) return true;
    try {
      const state = await this.netInfo.fetch();
      this.currentlyOnline = !!(state.isConnected && state.isInternetReachable !== false);
      this.currentQuality = qualityFromNetInfoState(state);
      return this.currentlyOnline;
    } catch {
      return true;
    }
  }

  /** Coarse connection quality for adaptive networking. */
  async getQuality(): Promise<NetworkQuality> {
    if (!this.available) return 'unknown';
    try {
      const state = await this.netInfo.fetch();
      this.currentQuality = qualityFromNetInfoState(state);
      return this.currentQuality;
    } catch {
      return 'unknown';
    }
  }

  getLastQuality(): NetworkQuality {
    return this.currentQuality;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onQualityChange(listener: QualityListener): () => void {
    this.qualityListeners.add(listener);
    return () => this.qualityListeners.delete(listener);
  }

  destroy() {
    this.unsubscribe?.();
    this.listeners.clear();
    this.qualityListeners.clear();
  }
}
