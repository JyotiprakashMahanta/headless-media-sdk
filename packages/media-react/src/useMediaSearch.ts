import { useCallback } from 'react';
import type { MediaKind, MediaOrientation, MediaSize, RequestOptions } from 'media-core';
import { useMediaClient } from './MediaProvider.js';
import { usePagedMedia, type UsePagedMediaResult } from './internal/usePagedMedia.js';

export interface UseMediaSearchOptions {
  query: string;
  kind?: MediaKind;
  perPage?: number;
  orientation?: MediaOrientation;
  size?: MediaSize;
  locale?: string;
  /** Skip fetching without unmounting — e.g. a hidden tab. */
  enabled?: boolean;
}

export type UseMediaSearchResult = UsePagedMediaResult;

/**
 * Paginated search.
 *
 * Returns items already accumulated across pages, plus a stable `loadMore` —
 * the shape a grid with infinite scroll actually wants. A hook that returned
 * one page at a time would push the accumulation, de-duplication and
 * race-handling into every consumer.
 *
 * An empty/whitespace query is not an error state: the hook simply reports
 * `items: []` and never calls the network.
 */
export function useMediaSearch({
  query,
  kind = 'photo',
  perPage,
  orientation,
  size,
  locale,
  enabled = true,
}: UseMediaSearchOptions): UseMediaSearchResult {
  const client = useMediaClient();
  const term = query.trim();

  const fetchPage = useCallback(
    (page: number, options: RequestOptions) =>
      client.search(
        {
          query: term,
          kind,
          page,
          ...(perPage === undefined ? {} : { perPage }),
          ...(orientation === undefined ? {} : { orientation }),
          ...(size === undefined ? {} : { size }),
          ...(locale === undefined ? {} : { locale }),
        },
        options,
      ),
    [client, term, kind, perPage, orientation, size, locale],
  );

  return usePagedMedia({
    fetchPage: term ? fetchPage : null,
    // A string key, not the callback identity: it makes "what restarts this
    // query" explicit and readable in the React DevTools.
    resetKey: JSON.stringify([term, kind, perPage, orientation, size, locale]),
    enabled: enabled && term.length > 0,
  });
}
