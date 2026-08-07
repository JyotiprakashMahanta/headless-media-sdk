import type { MediaError } from 'media-react';

/**
 * Errors are branched on `error.code`, never on the message string.
 *
 * That is the whole reason `media-core` ships an error taxonomy instead of
 * throwing raw `Error`s: "the key is wrong" and "we are rate limited" need
 * different copy and different affordances, and neither should depend on
 * matching English text that might change.
 */
export function ErrorNotice({ error, onRetry }: { error: MediaError; onRetry: () => void }): JSX.Element {
  const copy: Record<string, string> = {
    auth: 'Pexels rejected the API key. Check VITE_PEXELS_API_KEY in your .env.',
    rate_limit: 'Rate limited by Pexels (200 requests/hour on free keys). Wait a moment and retry.',
    not_found: 'That item no longer exists on Pexels.',
    network: 'Network problem reaching Pexels.',
  };

  return (
    <div className="error" role="alert">
      <p>{copy[error.code] ?? error.message}</p>
      {error.retryable && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
