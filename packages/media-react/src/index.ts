/**
 * media-react — React adapter for `media-core`.
 *
 * Contains no business logic: no URLs, no provider knowledge, no response
 * mapping. Every file here exists to solve a React problem (context lifetime,
 * stale responses, referential stability, effect cleanup) on top of a client
 * that already works without React.
 *
 * This package and `media-native` are the only packages allowed to import
 * `media-core`.
 */

export { MediaProvider, useMediaClient, useOptionalMediaClient } from './MediaProvider.js';
export type { MediaProviderProps } from './MediaProvider.js';

export { useMediaSearch } from './useMediaSearch.js';
export type { UseMediaSearchOptions, UseMediaSearchResult } from './useMediaSearch.js';

export { useCuratedMedia } from './useCuratedMedia.js';
export type { UseCuratedMediaOptions, UseCuratedMediaResult } from './useCuratedMedia.js';

export { useMediaItem } from './useMediaItem.js';
export type { UseMediaItemResult } from './useMediaItem.js';

export { useMediaEvent, useMediaEvents, useMediaActivity } from './useMediaEvents.js';

export { useMediaDownload } from './useMediaDownload.js';
export type { UseMediaDownloadResult } from './useMediaDownload.js';

export { useDebouncedValue } from './internal/useDebouncedValue.js';

/**
 * Re-exported so consumers never need `media-core` in their own package.json.
 * This is what keeps the dependency graph a tree: the app depends on the
 * wrapper, the wrapper depends on core, and nothing skips a level.
 */
export type {
  MediaItem,
  MediaPage,
  MediaKind,
  MediaRendition,
  MediaAuthor,
  MediaOrientation,
  MediaSize,
  MediaEvent,
  MediaEventName,
  MediaViewEvent,
  MediaDownloadEvent,
  MediaSearchEvent,
  MediaErrorEvent,
  MediaClient,
  MediaErrorCode,
} from 'media-core';
export { MediaError } from 'media-core';
