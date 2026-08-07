import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Share } from 'react-native';
import {
  MediaError,
  type MediaEvent,
  type MediaEventListener,
  type MediaEventMap,
  type MediaEventName,
  type MediaItem,
  type MediaKind,
  type RequestOptions,
} from 'media-core';
import { useMediaClient } from './MediaProvider.js';
import { usePagedMedia, type UsePagedMediaResult } from './internal/usePagedMedia.js';

/**
 * Same hook names, same return shapes as `media-react`.
 *
 * Where the two wrappers genuinely diverge is `useMediaDownload`, at the bottom
 * of this file — and that divergence is the argument for having two wrapper
 * packages at all. Everything above it is React, not platform.
 */

export interface UseMediaSearchOptions {
  query: string;
  kind?: MediaKind;
  perPage?: number;
  enabled?: boolean;
}

export function useMediaSearch({
  query,
  kind = 'photo',
  perPage,
  enabled = true,
}: UseMediaSearchOptions): UsePagedMediaResult {
  const client = useMediaClient();
  const term = query.trim();

  const fetchPage = useCallback(
    (page: number, options: RequestOptions) =>
      client.search({ query: term, kind, page, ...(perPage === undefined ? {} : { perPage }) }, options),
    [client, term, kind, perPage],
  );

  return usePagedMedia({
    fetchPage: term ? fetchPage : null,
    resetKey: JSON.stringify([term, kind, perPage]),
    enabled: enabled && term.length > 0,
  });
}

export function useCuratedMedia({
  kind = 'photo',
  perPage,
  enabled = true,
}: { kind?: MediaKind; perPage?: number; enabled?: boolean } = {}): UsePagedMediaResult {
  const client = useMediaClient();

  const fetchPage = useCallback(
    (page: number, options: RequestOptions) =>
      client.curated({ kind, page, ...(perPage === undefined ? {} : { perPage }) }, options),
    [client, kind, perPage],
  );

  return usePagedMedia({ fetchPage, resetKey: JSON.stringify(['curated', kind, perPage]), enabled });
}

export function useMediaItem(
  id: string | null | undefined,
  options: { initialItem?: MediaItem | null } = {},
): { item: MediaItem | null; isLoading: boolean; error: MediaError | null } {
  const client = useMediaClient();
  const { initialItem = null } = options;

  const [item, setItem] = useState<MediaItem | null>(initialItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<MediaError | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!id) {
      setItem(null);
      return;
    }
    if (initialItem && initialItem.id === id) {
      setItem(initialItem);
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
  }, [client, id, initialItem]);

  return { item, isLoading, error };
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export function useMediaEvent<K extends MediaEventName>(
  type: K,
  handler: (event: MediaEventMap[K]) => void,
): void {
  const client = useMediaClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: MediaEventListener<K> = (event) => handlerRef.current(event);
    return client.on(type, listener);
  }, [client, type]);
}

export function useMediaEvents(handler: (event: MediaEvent) => void): void {
  const client = useMediaClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => client.onAny((event) => handlerRef.current(event)), [client]);
}

/* -------------------------------------------------------------------------- */
/* Download — the one place the two wrappers genuinely differ                  */
/* -------------------------------------------------------------------------- */

export interface UseMediaDownloadResult {
  download: (item: MediaItem, options?: { surface?: string }) => Promise<void>;
  pendingId: string | null;
  error: MediaError | null;
}

/**
 * Core resolves the URL, the filename, and emits `download` — identical to web.
 * Only the last step changes: there is no `<a download>` on a phone, and
 * writing to the camera roll needs a native module the SDK has no business
 * requiring. The platform-correct default is the OS share sheet, falling back
 * to opening the URL.
 *
 * A production app would swap `Share` for `expo-file-system` /
 * `@react-native-camera-roll/camera-roll` here. Nothing above this line would
 * change — which is the entire argument for the core/wrapper split.
 */
export function useMediaDownload(): UseMediaDownloadResult {
  const client = useMediaClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<MediaError | null>(null);

  const download = useCallback(
    async (item: MediaItem, options: { surface?: string } = {}) => {
      const { url, filename } = client.download(item, { surface: options.surface ?? 'unknown' });
      setPendingId(item.id);
      setError(null);

      try {
        await Share.share({ url, message: url, title: filename }, { dialogTitle: 'Save or share' });
      } catch (caught) {
        try {
          await Linking.openURL(url);
        } catch {
          setError(new MediaError('network', 'Could not open the media URL.', { cause: caught }));
        }
      } finally {
        setPendingId(null);
      }
    },
    [client],
  );

  return { download, pendingId, error };
}
