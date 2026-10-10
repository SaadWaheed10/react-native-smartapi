import type { SmartApiRequestConfig } from '../types';

export interface TransportResult {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  /** Raw XHR response (blob/arraybuffer/text) when responseType is set. */
  raw: any;
}

export interface XhrTransportOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
  timeout?: number;
  signal?: AbortSignal;
  responseType?: '' | 'text' | 'blob' | 'arraybuffer' | 'json';
  onUploadProgress?: (percent: number) => void;
  onDownloadProgress?: (percent: number) => void;
}

/**
 * XMLHttpRequest transport — required for real byte-level upload/download
 * progress in React Native (fetch does not expose these events reliably).
 */
export function xhrRequest(options: XhrTransportOptions): Promise<TransportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url, true);

    if (options.timeout && options.timeout > 0) {
      xhr.timeout = options.timeout;
    }

    if (options.responseType) {
      xhr.responseType = options.responseType;
    }

    Object.entries(options.headers).forEach(([key, value]) => {
      // Let the runtime set multipart boundary for FormData bodies.
      if (key.toLowerCase() === 'content-type' && options.body instanceof FormData) {
        return;
      }
      xhr.setRequestHeader(key, value);
    });

    if (options.onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        options.onUploadProgress?.(percent);
      };
    }

    if (options.onDownloadProgress) {
      xhr.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        options.onDownloadProgress?.(percent);
      };
    }

    const onAbort = () => {
      xhr.abort();
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(createAbortError());
        return;
      }
      options.signal.addEventListener('abort', onAbort);
    }

    xhr.onload = () => {
      options.signal?.removeEventListener('abort', onAbort);
      const headers = parseResponseHeaders(xhr.getAllResponseHeaders());
      const bodyText =
        typeof xhr.response === 'string'
          ? xhr.response
          : xhr.responseText ?? '';
      resolve({
        status: xhr.status,
        headers,
        bodyText,
        raw: xhr.response,
      });
    };

    xhr.onerror = () => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(new TypeError('Network request failed'));
    };

    xhr.ontimeout = () => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(createTimeoutError());
    };

    xhr.onabort = () => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    xhr.send(options.body ?? null);
  });
}

/** Choose XHR automatically when progress callbacks are present. */
export function shouldUseXhr(
  transport: SmartApiRequestConfig['transport'] | undefined,
  config: SmartApiRequestConfig
): boolean {
  if (transport === 'xhr') return true;
  if (transport === 'fetch') return false;
  // FormData works with fetch; only auto-upgrade when progress is requested.
  return !!(config.onUploadProgress || config.onDownloadProgress);
}

function parseResponseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  raw
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index === -1) return;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      headers[key] = value;
    });
  return headers;
}

function createAbortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function createTimeoutError(): Error {
  const err = new Error('Timeout');
  err.name = 'TimeoutError';
  return err;
}
