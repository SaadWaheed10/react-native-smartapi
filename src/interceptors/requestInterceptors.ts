import type { DeviceInfoProvider, SmartApiRequestConfig } from '../core/types';
import type { TokenManager } from '../auth/TokenManager';
import type { Logger } from '../utils/logger';

export function createAuthInjector(tokenManager: TokenManager) {
  return async (config: SmartApiRequestConfig): Promise<SmartApiRequestConfig> => {
    if (config.skipAuth || !tokenManager.isConfigured()) return config;
    const authHeader = await tokenManager.getAuthHeader();
    if (!authHeader) return config;
    return {
      ...config,
      headers: { ...authHeader, ...config.headers },
    };
  };
}

export function createDeviceHeaderInjector(deviceInfo: DeviceInfoProvider) {
  return (config: SmartApiRequestConfig): SmartApiRequestConfig => {
    const headers: Record<string, string> = { ...config.headers };

    const platform = deviceInfo.getPlatform?.();
    const appVersion = deviceInfo.getAppVersion?.();
    const deviceId = deviceInfo.getDeviceId?.();

    if (platform && !headers['X-Platform']) headers['X-Platform'] = platform;
    if (appVersion && !headers['X-App-Version']) headers['X-App-Version'] = appVersion;
    if (deviceId && !headers['X-Device-Id']) headers['X-Device-Id'] = deviceId;

    return { ...config, headers };
  };
}

export function createRequestLogger(logger: Logger) {
  return (config: SmartApiRequestConfig): SmartApiRequestConfig => {
    logger.debug(`--> ${config.method ?? 'GET'} ${config.url}`, {
      headers: config.headers,
      params: config.params,
      data: config.data,
    });
    return config;
  };
}
