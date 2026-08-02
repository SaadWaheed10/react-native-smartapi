import type { AuthConfig } from '../core/types';

export class TokenManager {
  private config: AuthConfig;
  private refreshPromise: Promise<string | null | undefined> | null = null;

  constructor(config: AuthConfig = {}) {
    this.config = config;
  }

  updateConfig(config: AuthConfig) {
    this.config = { ...this.config, ...config };
  }

  isConfigured(): boolean {
    return !!this.config.getToken;
  }

  async getAuthHeader(): Promise<Record<string, string> | undefined> {
    if (!this.config.getToken) return undefined;
    const token = await this.config.getToken();
    if (!token) return undefined;

    const headerName = this.config.headerName ?? 'Authorization';
    const scheme = this.config.scheme ?? 'Bearer';
    const value = scheme ? `${scheme} ${token}` : token;

    return { [headerName]: value };
  }

  /**
   * Ensures only ONE refresh request is in-flight at a time even if multiple
   * requests hit 401 concurrently ("single-flight" pattern). All callers
   * await the same promise and get the same refreshed token (or null).
   */
  async refreshToken(): Promise<string | null | undefined> {
    if (!this.config.onRefreshToken) return null;

    if (!this.refreshPromise) {
      this.refreshPromise = this.config
        .onRefreshToken()
        .catch(() => null)
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  async handleUnauthorized(): Promise<void> {
    if (this.config.onUnauthorized) {
      await this.config.onUnauthorized();
    }
  }

  getMaxRefreshAttempts(): number {
    return this.config.maxRefreshAttempts ?? 1;
  }

  canRefresh(): boolean {
    return !!this.config.onRefreshToken;
  }
}
