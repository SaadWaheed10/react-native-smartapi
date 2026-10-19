import { buildQueryString, joinUrl } from '../utils/helpers';
import type { SmartApiRequestConfig } from './types';

export interface StreamEvent {
  event?: string;
  data: string;
  id?: string;
}

export interface StreamOptions extends Omit<SmartApiRequestConfig, 'url'> {
  /** Called for every SSE `data:` payload (or each chunk when not SSE). */
  onMessage?: (data: any, event: StreamEvent) => void;
  /** Called for every parsed SSE event. */
  onEvent?: (event: StreamEvent) => void;
  /** When true, try `JSON.parse` on each message before calling onMessage. */
  parseJson?: boolean;
  /** Called with raw text chunks as they arrive. */
  onChunk?: (chunk: string) => void;
}

export interface StreamHandle {
  /** Abort the active stream. */
  abort: () => void;
  /** Resolves when the stream completes (or rejects on hard failure). */
  done: Promise<void>;
}

/**
 * Open a streaming / SSE connection.
 * Uses `fetch` + ReadableStream when available; falls back to XHR progressive text.
 */
export function openStream(
  baseURL: string | undefined,
  url: string,
  options: StreamOptions = {}
): StreamHandle {
  const controller = new AbortController();
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const fullUrl = joinUrl(baseURL, url) + buildQueryString(options.params);
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    ...options.headers,
  };

  const done = (async () => {
    const body = buildJsonBody(options.data);
    if (body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Prefer fetch streaming when the runtime supports it.
    if (typeof fetch === 'function') {
      const response = await fetch(fullUrl, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
        ...options.fetchOptions,
      });

      if (!response.ok) {
        throw new Error(`Stream failed with status ${response.status}`);
      }

      const reader = (response.body as any)?.getReader?.();
      if (reader && typeof TextDecoder !== 'undefined') {
        await readFromReader(reader, options, controller.signal);
        return;
      }

      // RN often lacks body.getReader — fall through to full text (still useful for short streams)
      // Prefer XHR progressive for true streaming.
    }

    await readFromXhr(fullUrl, options, headers, body, controller.signal);
  })();

  return {
    abort: () => controller.abort(),
    done,
  };
}

function buildJsonBody(data: any): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
}

async function readFromReader(
  reader: { read: () => Promise<{ done: boolean; value?: Uint8Array }> },
  options: StreamOptions,
  signal: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    options.onChunk?.(chunk);
    buffer = consumeSseBuffer(buffer + chunk, options);
  }

  if (buffer.trim()) {
    consumeSseBuffer(buffer + '\n\n', options);
  }
}

function readFromXhr(
  fullUrl: string,
  options: StreamOptions,
  headers: Record<string, string>,
  body: string | undefined,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? 'GET', fullUrl, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    let lastIndex = 0;
    let buffer = '';

    const onAbort = () => {
      xhr.abort();
    };
    signal.addEventListener('abort', onAbort);

    xhr.onprogress = () => {
      const text = xhr.responseText ?? '';
      const chunk = text.slice(lastIndex);
      lastIndex = text.length;
      if (!chunk) return;
      options.onChunk?.(chunk);
      buffer = consumeSseBuffer(buffer + chunk, options);
    };

    xhr.onload = () => {
      signal.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (buffer.trim()) consumeSseBuffer(buffer + '\n\n', options);
        resolve();
      } else {
        reject(new Error(`Stream failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new TypeError('Network request failed'));
    };

    xhr.onabort = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(); // aborted intentionally
    };

    xhr.send(body ?? null);
  });
}

/** Parse SSE frames from a growing buffer; returns the unconsumed remainder. */
function consumeSseBuffer(buffer: string, options: StreamOptions): string {
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim() || part.startsWith(':')) continue;

    // Not SSE? Treat whole part as a message chunk.
    if (!/^(\s*(id|event|data|retry):)/m.test(part)) {
      emitMessage(part.trim(), { data: part.trim() }, options);
      continue;
    }

    const event: StreamEvent = { data: '' };
    const dataLines: string[] = [];

    part.split(/\n/).forEach((line) => {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else if (line.startsWith('event:')) event.event = line.slice(6).trim();
      else if (line.startsWith('id:')) event.id = line.slice(3).trim();
    });

    event.data = dataLines.join('\n');
    options.onEvent?.(event);
    emitMessage(event.data, event, options);
  }

  return rest;
}

function emitMessage(data: string, event: StreamEvent, options: StreamOptions): void {
  if (!options.onMessage) return;
  if (options.parseJson) {
    try {
      options.onMessage(JSON.parse(data) as any, event);
      return;
    } catch {
      // fall through with raw string
    }
  }
  options.onMessage(data, event);
}
