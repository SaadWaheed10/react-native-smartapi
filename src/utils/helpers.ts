/**
 * Small dependency-free helpers used across the package.
 * We intentionally avoid pulling in lodash to keep the package lightweight
 * and tree-shakeable.
 */

/** Get a nested value from an object using a dot path, e.g. "data.users[0].name". */
export function getByPath(obj: any, path?: string): any {
  if (!path) return obj;
  if (obj === null || obj === undefined) return undefined;

  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/** Shallow-ish deep merge for plain objects (arrays are replaced, not merged). */
export function deepMerge<T extends Record<string, any>>(target: T, source?: Partial<T>): T {
  if (!source) return target;
  const output: any = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = (source as any)[key];
    const targetVal = (target as any)[key];
    if (
      sourceVal &&
      targetVal &&
      typeof sourceVal === 'object' &&
      typeof targetVal === 'object' &&
      !Array.isArray(sourceVal) &&
      !Array.isArray(targetVal)
    ) {
      output[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      output[key] = sourceVal;
    }
  }
  return output;
}

export function buildQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const searchParams: string[] = [];

  const appendParam = (key: string, value: any) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => appendParam(`${key}[]`, v));
      return;
    }
    searchParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };

  Object.keys(params).forEach((key) => appendParam(key, params[key]));
  return searchParams.length ? `?${searchParams.join('&')}` : '';
}

export function joinUrl(baseURL: string | undefined, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!baseURL) return url;
  const trimmedBase = baseURL.replace(/\/+$/, '');
  const trimmedUrl = url.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedUrl}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPlainObject(value: any): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof FormData) &&
    !(value instanceof Blob)
  );
}

export function generateCacheKey(method: string, url: string, params?: Record<string, any>): string {
  const paramsKey = params ? JSON.stringify(sortObjectKeys(params)) : '';
  return `${method.toUpperCase()}:${url}:${paramsKey}`;
}

function sortObjectKeys(obj: Record<string, any>): Record<string, any> {
  return Object.keys(obj)
    .sort()
    .reduce((acc: Record<string, any>, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

/** Safely require an optional native module without throwing if it isn't installed. */
export function optionalRequire<T = any>(moduleName: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require(moduleName);
  } catch {
    return null;
  }
}
