import { SmartApiError } from './types';

/**
 * Duck-typed schema interface — works with Zod and anything that exposes
 * `parse` or `safeParse` without requiring `zod` as a hard dependency.
 */
export type SchemaLike<T = any> =
  | { parse: (data: unknown) => T }
  | {
      safeParse: (
        data: unknown
      ) => { success: true; data: T } | { success: false; error: any };
    };

/** Validate `data` against an optional schema; throws `VALIDATION_ERROR` on failure. */
export function validateWithSchema<T>(data: unknown, schema?: SchemaLike<T>): T {
  if (!schema) return data as T;

  if ('safeParse' in schema && typeof schema.safeParse === 'function') {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    const message = formatZodLikeError(result.error) || 'Response failed schema validation.';
    throw new SmartApiError({
      code: 'SCHEMA_VALIDATION',
      status: 0,
      message,
      type: 'VALIDATION_ERROR',
      details: result.error,
    });
  }

  if ('parse' in schema && typeof schema.parse === 'function') {
    try {
      return schema.parse(data);
    } catch (err: any) {
      throw new SmartApiError({
        code: 'SCHEMA_VALIDATION',
        status: 0,
        message: formatZodLikeError(err) || err?.message || 'Response failed schema validation.',
        type: 'VALIDATION_ERROR',
        details: err,
      });
    }
  }

  return data as T;
}

function formatZodLikeError(error: any): string | undefined {
  if (!error) return undefined;
  if (typeof error.message === 'string' && !error.issues) return error.message;
  const issues = error.issues ?? error.errors;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((i: any) => {
        const path = Array.isArray(i.path) ? i.path.join('.') : '';
        return path ? `${path}: ${i.message}` : i.message;
      })
      .filter(Boolean)
      .join('; ');
  }
  return undefined;
}
