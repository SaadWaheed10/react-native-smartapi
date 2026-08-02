/**
 * Applies a user-supplied transform function to (already-selected) response
 * data. Kept intentionally minimal — the power here is that developers pass
 * their own mapping/filtering/sorting/renaming logic as a plain function,
 * e.g.:
 *
 *   api.get('/users', {
 *     transform: (users) => users
 *       .filter(u => u.active)
 *       .sort((a, b) => a.name.localeCompare(b.name))
 *       .map(u => ({ id: u.user_id, name: u.full_name }))
 *   })
 */
export function applyTransform<TIn = any, TOut = any>(
  data: TIn,
  transform?: (data: TIn) => TOut
): TOut {
  if (!transform) return data as unknown as TOut;
  return transform(data);
}

/** Helper: rename object keys according to a mapping table. */
export function renameKeys<T extends Record<string, any>>(
  obj: T,
  mapping: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const newKey = mapping[key] ?? key;
    result[newKey] = obj[key];
  }
  return result;
}

/** Helper: convert ISO date strings on given keys into Date objects. */
export function convertDates<T extends Record<string, any>>(obj: T, dateKeys: string[]): T {
  const result: any = { ...obj };
  for (const key of dateKeys) {
    if (result[key]) {
      const parsed = new Date(result[key]);
      if (!Number.isNaN(parsed.getTime())) result[key] = parsed;
    }
  }
  return result;
}
