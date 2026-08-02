import { SmartApiError } from '../core/types';
import type { ErrorType } from '../core/types';
import { getHttpErrorMessage, NETWORK_ERROR_MESSAGES } from './errorMaps';

export interface NormalizeErrorOptions {
  /** Response status if this originated from an HTTP response. */
  status?: number;
  /** Parsed response body, if any. */
  body?: any;
  /** Custom backend error code -> message overrides, merged over defaults. */
  errorMap?: Record<string, string>;
  /** The raw caught error/exception. */
  raw?: unknown;
  /** Was this request aborted intentionally? */
  aborted?: boolean;
}

/**
 * Central place that turns *any* failure — HTTP error responses, native
 * fetch/network exceptions, JSON parse failures, aborts, or custom backend
 * error payloads — into the single unified SmartApiError shape:
 *   { code, status, message, type, details }
 */
export class ErrorEngine {
  private globalErrorMap: Record<string, string>;

  constructor(globalErrorMap: Record<string, string> = {}) {
    this.globalErrorMap = globalErrorMap;
  }

  setGlobalErrorMap(map: Record<string, string>) {
    this.globalErrorMap = { ...this.globalErrorMap, ...map };
  }

  normalize(options: NormalizeErrorOptions): SmartApiError {
    if (options.aborted) {
      return new SmartApiError({
        code: 'REQUEST_CANCELLED',
        status: 0,
        message: NETWORK_ERROR_MESSAGES.REQUEST_CANCELLED,
        type: 'CANCELLED',
      });
    }

    if (typeof options.status === 'number' && options.status > 0) {
      return this.fromHttpResponse(options.status, options.body, options.errorMap);
    }

    return this.fromException(options.raw);
  }

  private fromHttpResponse(
    status: number,
    body: any,
    errorMap?: Record<string, string>
  ): SmartApiError {
    const mergedMap = { ...this.globalErrorMap, ...(errorMap ?? {}) };

    // Try to detect a custom backend error code, e.g. { code: 'USER_NOT_FOUND' }
    // or { error: 'INVALID_OTP' } or { errorCode: '...' }.
    const backendCode: string | undefined =
      body?.code ?? body?.error ?? body?.errorCode ?? body?.error_code;

    let message: string | undefined;
    let type: ErrorType = 'HTTP_ERROR';

    if (backendCode && mergedMap[backendCode]) {
      message = mergedMap[backendCode];
    } else if (typeof body?.message === 'string') {
      message = body.message;
    } else if (Array.isArray(body?.errors) && body.errors.length > 0) {
      message = body.errors.map((e: any) => e.message ?? e).join(', ');
      type = 'VALIDATION_ERROR';
    }

    if (status === 401 || status === 403) type = 'AUTH_ERROR';
    if (status === 422) type = 'VALIDATION_ERROR';

    return new SmartApiError({
      code: backendCode ?? `HTTP_${status}`,
      status,
      message: message ?? getHttpErrorMessage(status),
      type,
      details: body,
    });
  }

  private fromException(raw: unknown): SmartApiError {
    const err = raw as any;
    const message: string = err?.message ?? String(raw ?? 'Unknown error');

    // AbortController abort surfaces as a DOMException/Error named "AbortError".
    if (err?.name === 'AbortError') {
      return new SmartApiError({
        code: 'REQUEST_CANCELLED',
        status: 0,
        message: NETWORK_ERROR_MESSAGES.REQUEST_CANCELLED,
        type: 'CANCELLED',
      });
    }

    if (/timeout/i.test(message)) {
      return new SmartApiError({
        code: 'TIMEOUT',
        status: 0,
        message: NETWORK_ERROR_MESSAGES.TIMEOUT,
        type: 'TIMEOUT_ERROR',
        details: err,
      });
    }

    if (/network request failed|failed to fetch|networkerror/i.test(message)) {
      return new SmartApiError({
        code: 'NO_INTERNET',
        status: 0,
        message: NETWORK_ERROR_MESSAGES.NO_INTERNET,
        type: 'NETWORK_ERROR',
        details: err,
      });
    }

    if (/ssl|certificate/i.test(message)) {
      return new SmartApiError({
        code: 'SSL_ERROR',
        status: 0,
        message: NETWORK_ERROR_MESSAGES.SSL_ERROR,
        type: 'NETWORK_ERROR',
        details: err,
      });
    }

    if (/json/i.test(message) && /parse|unexpected token/i.test(message)) {
      return new SmartApiError({
        code: 'PARSE_ERROR',
        status: 0,
        message: 'Failed to parse the server response.',
        type: 'PARSE_ERROR',
        details: err,
      });
    }

    return new SmartApiError({
      code: 'UNKNOWN_ERROR',
      status: 0,
      message: NETWORK_ERROR_MESSAGES.UNKNOWN,
      type: 'UNKNOWN_ERROR',
      details: err,
    });
  }
}

export const defaultErrorEngine = new ErrorEngine();
