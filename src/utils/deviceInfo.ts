import { optionalRequire } from './helpers';
import type { DeviceInfoProvider } from '../core/types';

/**
 * Default device info provider. Uses React Native's `Platform` module when
 * available and falls back gracefully in non-RN / test environments.
 * Reads the app version from `react-native-device-info` if the consumer has
 * it installed (optional peer dependency), otherwise omits it.
 */
export function createDefaultDeviceInfoProvider(): DeviceInfoProvider {
  const RNPlatform = optionalRequire<{ OS: 'ios' | 'android'; Version?: string | number }>(
    'react-native'
  );
  const DeviceInfoModule = optionalRequire<{
    getVersion?: () => string;
    getUniqueId?: () => string | Promise<string>;
  }>('react-native-device-info');

  return {
    getPlatform: () => {
      try {
        return (RNPlatform as any)?.Platform?.OS ?? 'unknown';
      } catch {
        return 'unknown';
      }
    },
    getAppVersion: () => {
      try {
        return DeviceInfoModule?.getVersion ? DeviceInfoModule.getVersion() : undefined;
      } catch {
        return undefined;
      }
    },
    getDeviceId: () => {
      // Synchronous best-effort only; async device IDs should be fetched
      // by the consumer and passed in via a custom deviceInfo provider.
      return undefined;
    },
  };
}
