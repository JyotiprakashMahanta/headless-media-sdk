/**
 * media-native — React Native adapter for `media-core`.
 *
 * Exposes the same hook names and the same return shapes as `media-react`, so
 * feature code reads identically on both platforms. The only behavioural
 * difference is `useMediaDownload`, which uses the OS share sheet instead of an
 * anchor element — see `hooks.ts`.
 */

export { MediaProvider, useMediaClient } from './MediaProvider.js';
export type { MediaProviderProps } from './MediaProvider.js';

export {
  useMediaSearch,
  useCuratedMedia,
  useMediaItem,
  useMediaEvent,
  useMediaEvents,
  useMediaDownload,
} from './hooks.js';
export type { UseMediaSearchOptions, UseMediaDownloadResult } from './hooks.js';

export type { UsePagedMediaResult, PagedMediaState } from './internal/usePagedMedia.js';

export type {
  MediaItem,
  MediaPage,
  MediaKind,
  MediaEvent,
  MediaEventName,
  MediaClient,
} from 'media-core';
export { MediaError } from 'media-core';
