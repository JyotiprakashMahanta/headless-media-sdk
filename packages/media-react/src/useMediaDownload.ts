import { useCallback, useState } from 'react';
import { MediaError, type MediaItem } from 'media-core';
import { useMediaClient } from './MediaProvider.js';

/**
 * Web download.
 *
 * The split is the interesting part, and it is the clearest example of what
 * "wrappers adapt, they do not decide" means:
 *
 *   media-core  -> which URL, what filename, and emitting the `download` event
 *   media-react -> turning that into bytes on disk, the browser way
 *   media-native-> the same call, but Share sheet / FileSystem (see media-native)
 *
 * Core cannot do the second half (no DOM). The wrapper must not do the first
 * half (that is provider knowledge). Neither can be moved without breaking the
 * other platform.
 *
 * Implementation note: a cross-origin `<a download>` is ignored by browsers and
 * silently navigates instead, so we fetch to a Blob and revoke the object URL.
 * On failure we fall back to opening the source page, which always works.
 */
export interface UseMediaDownloadResult {
  download: (item: MediaItem, options?: { surface?: string }) => Promise<void>;
  /** Id of the item currently downloading, or `null`. */
  pendingId: string | null;
  error: MediaError | null;
}

export function useMediaDownload(): UseMediaDownloadResult {
  const client = useMediaClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<MediaError | null>(null);

  const download = useCallback(
    async (item: MediaItem, options: { surface?: string } = {}) => {
      // Core resolves + emits. Always happens, even if the save below fails —
      // the user did express download intent and analytics should see it.
      const { url, filename } = client.download(item, { surface: options.surface ?? 'unknown' });

      setPendingId(item.id);
      setError(null);

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed with ${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (caught) {
        setError(
          new MediaError('network', 'Could not save the file. Opening the source page instead.', {
            cause: caught,
          }),
        );
        window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
      } finally {
        setPendingId(null);
      }
    },
    [client],
  );

  return { download, pendingId, error };
}
