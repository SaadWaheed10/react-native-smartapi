import { optionalRequire } from '../utils/helpers';

type Listener = (isOnline: boolean) => void;

/**
 * Wraps `@react-native-community/netinfo` (optional peer dependency).
 * If NetInfo isn't installed, this assumes the device is always online —
 * requests will simply surface real network errors as they occur, and
 * offline-queueing features become inert rather than breaking the app.
 */
export class NetworkMonitor {
  private netInfo: any;
  private listeners = new Set<Listener>();
  private currentlyOnline = true;
  private unsubscribe: (() => void) | null = null;
  readonly available: boolean;

  constructor() {
    const mod = optionalRequire<any>('@react-native-community/netinfo');
    this.netInfo = mod?.default ?? mod;
    this.available = !!this.netInfo;

    if (this.available) {
      this.unsubscribe = this.netInfo.addEventListener((state: any) => {
        const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
        if (isOnline !== this.currentlyOnline) {
          this.currentlyOnline = isOnline;
          this.listeners.forEach((listener) => listener(isOnline));
        }
      });
    }
  }

  async isOnline(): Promise<boolean> {
    if (!this.available) return true;
    try {
      const state = await this.netInfo.fetch();
      this.currentlyOnline = !!(state.isConnected && state.isInternetReachable !== false);
      return this.currentlyOnline;
    } catch {
      return true;
    }
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
