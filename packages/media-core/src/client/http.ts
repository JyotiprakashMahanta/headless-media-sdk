import {
  MediaAuthError,
  MediaError,
  MediaNotFoundError,
  MediaRateLimitError,
  toMediaError,
} from '../errors.js';
import type { AbortSignalLike } from '../types.js';

/**
 * Transport layer — and the ONLY module in the repo that touches the API key.
 *
 * The key is captured in a closure by `createHttpClient` and is never stored on
 * an instance property, never returned, never put in a cache key, never in an
 * event payload, and never in an error message or `endpoint` field. If you want
 * to know where the credential can leak from, the answer is "this file", and
 * that is the entire point of isolating it.
 */

/* -------------------------------------------------------------------------- */
/* Structural fetch types                                                     */
/* -------------------------------------------------------------------------- */

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface FetchInitLike {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignalLike;
}

/**
 * Everything the SDK needs from `fetch`, typed structurally.
 *
 * Declared by hand instead of using `lib.dom`'s `fetch` so core has no DOM
 * dependency, and so tests and a CLI can pass a stub without `undici` or
 * `jsdom`. Node 18+, Deno, Bun, RN and every browser satisfy this shape.
 */
export type FetchLike = (url: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

export interface HttpClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Defaults to the host's global `fetch`. */
  readonly fetch?: FetchLike;
  /** Header carrying the credential. Pexels uses bare `Authorization`. */
  readonly authHeader?: string;
}

export interface HttpClient {
  get<T>(path: string, params?: Record<string, unknown>, options?: { signal?: AbortSignalLike }): Promise<T>;
  /** Path + sorted query string, with no credential in it. Used for cache keys. */
  describe(path: string, params?: Record<string, unknown>): string;
}

/* -------------------------------------------------------------------------- */
/* Query building                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Built by hand rather than with `URLSearchParams`, which lives in `lib.dom`.
 * Sorted for stable cache keys; empty values dropped so the provider does not
 * see `&orientation=`.
 */
export function buildQuery(params: Record<string, unknown> = {}): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (pairs.length === 0) return '';
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
}

function resolveGlobalFetch(): FetchLike {
  const candidate = (globalThis as Record<string, unknown>)['fetch'];
  if (typeof candidate !== 'function') {
    throw new MediaError(
      'unknown',
      'No global fetch available. Pass one explicitly: configureMedia({ apiKey, fetch: myFetch }).',
    );
  }
  return candidate as FetchLike;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : null;
}

/** Maps HTTP status -> our error taxonomy. `endpoint` never carries the key. */
function errorForStatus(response: FetchResponseLike, endpoint: string, body: string): MediaError {
  const context = { endpoint, status: response.status };

  switch (response.status) {
    case 401:
    case 403:
      return new MediaAuthError(undefined, context);
    case 404:
      return new MediaNotFoundError(undefined, context);
    case 429:
      return new MediaRateLimitError(parseRetryAfter(response.headers.get('Retry-After')), context);
    default:
      if (response.status >= 500) {
        return new MediaError('network', `Provider error ${response.status}. ${response.statusText}`, context);
      }
      return new MediaError(
        'invalid_request',
        `Request rejected (${response.status}). ${body.slice(0, 200)}`,
        context,
      );
  }
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  // Captured, not stored. Nothing below returns or logs it.
  const apiKey = options.apiKey;
  const authHeader = options.authHeader ?? 'Authorization';
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? resolveGlobalFetch();

  const describe = (path: string, params: Record<string, unknown> = {}): string =>
    `${path}${buildQuery(params)}`;

  return {
    describe,

    async get<T>(
      path: string,
      params: Record<string, unknown> = {},
      requestOptions: { signal?: AbortSignalLike } = {},
    ): Promise<T> {
      const endpoint = describe(path, params);
      const url = `${baseUrl}${endpoint}`;

      let response: FetchResponseLike;
      try {
        response = await doFetch(url, {
          method: 'GET',
          headers: {
            [authHeader]: apiKey,
            Accept: 'application/json',
          },
          ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        });
      } catch (error) {
        // Network-level failure: DNS, offline, CORS, abort.
        throw toMediaError(error, endpoint);
      }

      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch {
          /* body is best-effort context only */
        }
        throw errorForStatus(response, endpoint, body);
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new MediaError('parse', 'Provider returned a body that is not valid JSON.', {
          endpoint,
          status: response.status,
          cause: error,
        });
      }
    },
  };
}
