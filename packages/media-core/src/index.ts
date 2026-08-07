/**
 * media-core — framework-agnostic media SDK.
 *
 * Contains no React, no DOM and no React Native. It compiles with
 * `"lib": ["ES2022"], "types": []`, which means the compiler enforces that
 * claim rather than a comment asserting it.
 *
 * Consumed only by the platform wrappers (`media-react`, `media-native`).
 * The component libraries and the app never import this package.
 */

/* Client */
export {
  createMediaClient,
  configureMedia,
  getMediaClient,
  resetMediaClient,
  DEFAULT_BASE_URL,
} from './client/mediaClient.js';
export type { MediaClient, MediaClientConfig, DownloadResult } from './client/mediaClient.js';

/* Transport (exported so hosts can inject a fetch or a proxy) */
export { createHttpClient, buildQuery } from './client/http.js';
export type { FetchLike, FetchInitLike, FetchResponseLike, HttpClient, HttpClientOptions } from './client/http.js';

/* Domain types */
export type {
  MediaItem,
  MediaPage,
  MediaKind,
  MediaRendition,
  MediaAuthor,
  MediaOrientation,
  MediaSize,
  SearchQuery,
  CuratedQuery,
  RequestOptions,
  AbortSignalLike,
} from './types.js';

/* Events */
export { MediaEventEmitter, createConsoleEventListener } from './events/emitter.js';
export type {
  MediaEvent,
  MediaEventMap,
  MediaEventName,
  MediaEventListener,
  MediaAnyEventListener,
  MediaViewEvent,
  MediaDownloadEvent,
  MediaSearchEvent,
  MediaErrorEvent,
  Unsubscribe,
} from './events/types.js';

/* Cache */
export { MediaCache, cacheKey } from './cache/cache.js';
export type { MediaCacheOptions, CacheEntry } from './cache/cache.js';

/* Errors */
export {
  MediaError,
  MediaAuthError,
  MediaRateLimitError,
  MediaNotFoundError,
  MediaNetworkError,
  MediaAbortError,
  toMediaError,
} from './errors.js';
export type { MediaErrorCode, MediaErrorContext } from './errors.js';

/* Provider adapter — exported for tests and for anyone writing a sibling
   adapter (e.g. Unsplash) against the same mapping contract. */
export { mapPhoto, mapVideo, mapPhotoPage, mapVideoPage, parseMediaId } from './client/pexels.js';
export type {
  RawPexelsPhoto,
  RawPexelsVideo,
  RawPexelsPhotoPage,
  RawPexelsVideoPage,
} from './client/pexels.js';
