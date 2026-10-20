import { getDefaultApi } from '../core/config';
import type { SmartApiClient } from '../core/SmartApiClient';
import type { SmartApiRequestConfig } from '../core/types';

export type PrefetchLoader = (ctx: {
  routeName: string;
  params?: Record<string, any>;
}) =>
  | Promise<any>
  | SmartApiRequestConfig
  | SmartApiRequestConfig[]
  | null
  | undefined;

export interface PrefetchOnFocusOptions {
  client?: SmartApiClient;
}

/**
 * Prefetch API data when a React Navigation / Expo Router screen gains focus.
 *
 *   const unsubscribe = prefetchOnFocus(navigation, {
 *     PostDetail: ({ params }) => ({ url: `/posts/${params.id}`, method: 'GET' }),
 *     Feed: () => [{ url: '/feed' }, { url: '/stories' }],
 *   });
 *
 * `navigation` must support `addListener('state' | 'focus', ...)`
 * (React Navigation object or similar).
 */
export function prefetchOnFocus(
  navigation: any,
  routeLoaders: Record<string, PrefetchLoader>,
  options: PrefetchOnFocusOptions = {}
): () => void {
  if (!navigation || typeof navigation.addListener !== 'function') {
    return () => undefined;
  }

  const client = options.client ?? getDefaultApi();
  const runForRoute = async (routeName: string, params?: Record<string, any>) => {
    const loader = routeLoaders[routeName];
    if (!loader) return;
    const result = await loader({ routeName, params });
    if (!result) return;

    if (Array.isArray(result)) {
      await Promise.all(
        result.map((cfg) =>
          isRequestConfig(cfg) ? client.request(cfg) : Promise.resolve(cfg)
        )
      );
      return;
    }

    if (isRequestConfig(result)) {
      await client.request(result);
    }
  };

  // React Navigation: listen to state changes and prefetch focused route.
  const unsubState = navigation.addListener('state', (e: any) => {
    const route = getFocusedRoute(e?.data?.state ?? navigation.getState?.());
    if (route) void runForRoute(route.name, route.params);
  });

  // Also support a single-screen focus listener when attached to a screen.
  const unsubFocus =
    typeof navigation.addListener === 'function'
      ? navigation.addListener('focus', () => {
          const route = navigation.getCurrentRoute?.() ?? getFocusedRoute(navigation.getState?.());
          if (route) void runForRoute(route.name, route.params);
        })
      : undefined;

  return () => {
    unsubState?.();
    unsubFocus?.();
  };
}

/** Prefetch a single URL/config immediately (imperative helper). */
export function prefetch(
  urlOrConfig: string | SmartApiRequestConfig,
  client?: SmartApiClient
): Promise<any> {
  const api = client ?? getDefaultApi();
  if (typeof urlOrConfig === 'string') {
    return api.get(urlOrConfig, { cache: true });
  }
  return api.request(urlOrConfig);
}

function isRequestConfig(value: any): value is SmartApiRequestConfig {
  return value && typeof value === 'object' && typeof value.url === 'string';
}

function getFocusedRoute(state: any): { name: string; params?: any } | null {
  if (!state) return null;
  let current = state;
  while (current?.routes && typeof current.index === 'number') {
    const route = current.routes[current.index];
    if (!route) break;
    if (route.state) {
      current = route.state;
      continue;
    }
    return { name: route.name, params: route.params };
  }
  return current?.name ? { name: current.name, params: current.params } : null;
}
