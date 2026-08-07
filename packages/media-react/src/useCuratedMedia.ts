import { useCallback } from 'react';
import type { MediaKind, RequestOptions } from 'media-core';
import { useMediaClient } from './MediaProvider.js';
import { usePagedMedia, type UsePagedMediaResult } from './internal/usePagedMedia.js';

export interface UseCuratedMediaOptions {
  kind?: MediaKind;
  perPage?: number;
  enabled?: boolean;
}

export type UseCuratedMediaResult = UsePagedMediaResult;

/**
 * Curated / trending feed — the "empty state" of a search UI.
 *
 * Same return shape as `useMediaSearch` on purpose: a Grid should be able to
 * consume either without a single conditional, so the app can swap feeds by
 * swapping hooks.
 */
export function useCuratedMedia({
  kind = 'photo',
  perPage,
  enabled = true,
}: UseCuratedMediaOptions = {}): UseCuratedMediaResult {
  const client = useMediaClient();

  const fetchPage = useCallback(
    (page: number, options: RequestOptions) =>
      client.curated({ kind, page, ...(perPage === undefined ? {} : { perPage }) }, options),
    [client, kind, perPage],
  );

  return usePagedMedia({
    fetchPage,
    resetKey: JSON.stringify(['curated', kind, perPage]),
    enabled,
  });
}
