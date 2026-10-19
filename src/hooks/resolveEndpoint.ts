import {
  isDefinedEndpoint,
  type DefinedEndpoint,
  type PathParams,
} from '../core/defineApi';
import type { HttpMethod } from '../core/types';

export type UrlInput = string | null | DefinedEndpoint;

export interface ResolvedEndpoint {
  url: string | null;
  method: HttpMethod;
}

/**
 * Normalize a string URL or `defineApi` endpoint into a concrete url + method.
 */
export function resolveEndpoint(
  input: UrlInput,
  options: { pathParams?: PathParams; method?: HttpMethod } = {}
): ResolvedEndpoint {
  if (input == null) {
    return { url: null, method: options.method ?? 'GET' };
  }

  if (isDefinedEndpoint(input)) {
    return {
      url: input.buildUrl(options.pathParams),
      method: options.method ?? input.$method,
    };
  }

  return { url: input, method: options.method ?? 'GET' };
}
