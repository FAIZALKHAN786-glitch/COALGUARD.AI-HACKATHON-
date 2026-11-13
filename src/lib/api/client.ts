/**
 * Centralised HTTP client for the CoalGuard backend.
 *
 * Responsibilities:
 *  - attach the bearer token issued by the identity provider
 *  - enforce a request timeout and support caller-supplied abort signals
 *  - normalise every failure into an `AppError`
 *  - never fall back to fabricated data when a request fails
 */

import {
  AppError,
  NetworkError,
  TimeoutError,
  errorForStatus,
  normaliseError,
} from '@/lib/errors/normalise';

export interface HttpClientOptions {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Idempotency key - prevents duplicate mutations on double submit. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null | Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken ?? (() => null);
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  buildUrl(path: string, query?: RequestOptions['query']): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalisedPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
          value.forEach((entry) => url.searchParams.append(key, entry));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      query,
      signal,
      timeoutMs = this.timeoutMs,
      idempotencyKey,
      headers = {},
    } = options;

    if (!this.fetchImpl) {
      throw new NetworkError('No fetch implementation is available in this environment.');
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new TimeoutError().message), timeoutMs);
    const externalAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', externalAbort);

    const token = await this.getToken();

    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;

    try {
      const response = await this.fetchImpl(this.buildUrl(path, query), {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
      });

      if (!response.ok) {
        await this.throwForResponse(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (
        contentType.includes('text/csv') ||
        contentType.includes('text/plain') ||
        contentType.includes('text/markdown')
      ) {
        return text as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AppError({
          status: response.status,
          code: 'malformed_response',
          message: 'The server returned a response that could not be parsed.',
        });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) {
        if (signal?.aborted) {
          throw new AppError({ status: 0, code: 'aborted', message: 'The request was cancelled.' });
        }
        throw new TimeoutError();
      }
      if (error instanceof TypeError) {
        throw new NetworkError();
      }
      throw normaliseError(error);
    } finally {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener('abort', externalAbort);
    }
  }

  private async throwForResponse(response: Response): Promise<never> {
    let message: string | undefined;
    let code: string | undefined;
    let details: Record<string, string[]> | undefined;
    let requestId: string | undefined;

    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            message?: string;
            error?: string;
            code?: string;
            details?: Record<string, string[]>;
            requestId?: string;
          };
          message = parsed.message ?? parsed.error;
          code = parsed.code;
          details = parsed.details;
          requestId = parsed.requestId;
        } catch {
          message = text.slice(0, 300);
        }
      }
    } catch {
      message = undefined;
    }

    const requestIdHeader = response.headers.get('x-request-id');
    if (!requestId && requestIdHeader) requestId = requestIdHeader;

    throw errorForStatus(response.status, message).withServerInfo({ code, details, requestId });
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
