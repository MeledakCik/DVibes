import { nativeFetch } from '@/lib/native/platform';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class HttpError extends Error {
  status?: number;
  url: string;
  bodyPreview?: string;

  constructor(message: string, url: string, status?: number, bodyPreview?: string) {
    super(message);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

interface FetchJsonOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 5000, headers, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const response = await nativeFetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': USER_AGENT,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...headers
      }
    });

    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 180);

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}${preview ? `: ${preview}` : ''}`,
        url,
        response.status,
        preview
      );
    }

    if (!text.trim()) {
      throw new HttpError('Empty response body', url, response.status);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError('Upstream did not return JSON', url, response.status, preview);
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const error = record.error;
      if (typeof error === 'string' && error.trim()) {
        throw new HttpError(`Upstream error: ${error}`, url, response.status, preview);
      }
    }

    return data as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(`Timed out after ${timeoutMs}ms`, url);
    }
    throw new HttpError(error instanceof Error ? error.message : 'Network request failed', url);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function toPositiveNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
