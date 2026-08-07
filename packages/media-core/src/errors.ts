/**
 * Error taxonomy.
 *
 * Consumers should be able to branch on *meaning* ("the key is bad", "we are
 * rate limited, back off for N seconds") without string-matching messages or
 * knowing HTTP status codes. Everything thrown by the SDK is a `MediaError`.
 */

export type MediaErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'invalid_request'
  | 'network'
  | 'aborted'
  | 'parse'
  | 'unknown';

export interface MediaErrorContext {
  /** Path only — never includes the API key or Authorization header. */
  readonly endpoint?: string;
  readonly status?: number;
  readonly cause?: unknown;
}

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly endpoint: string | undefined;
  readonly status: number | undefined;
  /** True when retrying the identical request might succeed. */
  readonly retryable: boolean;

  constructor(code: MediaErrorCode, message: string, context: MediaErrorContext = {}) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause });
    this.name = 'MediaError';
    this.code = code;
    this.endpoint = context.endpoint;
    this.status = context.status;
    this.retryable = code === 'network' || code === 'rate_limit';
  }

  static is(value: unknown): value is MediaError {
    return value instanceof MediaError;
  }
}

export class MediaAuthError extends MediaError {
  constructor(message = 'Pexels rejected the API key. Check configureMedia({ apiKey }).', context: MediaErrorContext = {}) {
    super('auth', message, context);
    this.name = 'MediaAuthError';
  }
}

export class MediaRateLimitError extends MediaError {
  /** Seconds to wait before retrying, when the provider tells us. */
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null, context: MediaErrorContext = {}) {
    super(
      'rate_limit',
      retryAfterSeconds === null
        ? 'Rate limited by Pexels.'
        : `Rate limited by Pexels. Retry in ${retryAfterSeconds}s.`,
      context,
    );
    this.name = 'MediaRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MediaNotFoundError extends MediaError {
  constructor(message = 'Media item not found.', context: MediaErrorContext = {}) {
    super('not_found', message, context);
    this.name = 'MediaNotFoundError';
  }
}

export class MediaNetworkError extends MediaError {
  constructor(message = 'Network request failed.', context: MediaErrorContext = {}) {
    super('network', message, context);
    this.name = 'MediaNetworkError';
  }
}

export class MediaAbortError extends MediaError {
  constructor(context: MediaErrorContext = {}) {
    super('aborted', 'Request was aborted.', context);
    this.name = 'MediaAbortError';
  }
}

/** Normalises anything thrown inside the SDK into a `MediaError`. */
export function toMediaError(value: unknown, endpoint?: string): MediaError {
  if (MediaError.is(value)) return value;

  const name = typeof value === 'object' && value !== null && 'name' in value ? String((value as { name: unknown }).name) : '';
  if (name === 'AbortError') return new MediaAbortError({ endpoint, cause: value });

  const message = value instanceof Error ? value.message : String(value);
  return new MediaNetworkError(message, { endpoint, cause: value });
}
