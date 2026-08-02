import { getByPath } from '../utils/helpers';

/**
 * Extracts a sub-value from a response body using a dot-path selector, e.g.
 *   select("data.profile.name")
 *   select("data.users")   // array extraction
 * Returns the original data unchanged if no selector is provided, or
 * `undefined` if the path doesn't resolve (never throws).
 */
export function selectData<T = any>(data: any, selectPath?: string): T {
  if (!selectPath) return data;
  return getByPath(data, selectPath) as T;
}
