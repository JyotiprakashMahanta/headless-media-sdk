import { useEffect, useRef, useState } from 'react';
import { MediaError, type MediaItem } from 'media-core';
import { useMediaClient } from './MediaProvider.js';

export interface UseMediaItemResult {
  item: MediaItem | null;
  isLoading: boolean;
  error: MediaError | null;
}

/**
 * Single item by id — for deep links (`/photo/photo:123`) and for a lightbox
 * opened from a URL rather than from a grid click.
 *
 * `initialItem` matters more than it looks: when the lightbox is opened from a
 * grid we already have the full item, so passing it means zero requests and no
 * loading flash. Core's cache would also cover this, but only after one
 * round-trip; this covers it before.
 */
export function useMediaItem(
  id: string | null | undefined,
  options: { initialItem?: MediaItem | null; enabled?: boolean } = {},
): UseMediaItemResult {
  const client = useMediaClient();
  const { initialItem = null, enabled = true } = options;

  const [item, setItem] = useState<MediaItem | null>(initialItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<MediaError | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    if (!id || !enabled) {
      setItem(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (initialItem && initialItem.id === id) {
      setItem(initialItem);
      setError(null);
      setIsLoading(false);
      return;
    }

    const token = ++requestId.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    client
      .getById(id, { signal: controller.signal })
      .then((result) => {
        if (token !== requestId.current) return;
        setItem(result);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (token !== requestId.current) return;
        const mediaError = MediaError.is(caught)
          ? caught
          : new MediaError('unknown', caught instanceof Error ? caught.message : String(caught));
        if (mediaError.code === 'aborted') return;
        setError(mediaError);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [client, id, enabled, initialItem]);

  return { item, isLoading, error };
}
