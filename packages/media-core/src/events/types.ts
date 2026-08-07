import type { MediaItem } from '../types.js';

/**
 * Event payloads.
 *
 * Note what is NOT here: no API key, no auth header, no raw provider response.
 * Events are an activity log; anything that subscribes to them (analytics, a
 * console logger, the app's own counter) has no business seeing credentials.
 */

interface BaseEvent {
  /** Epoch millis, injected by the emitter so listeners agree on ordering. */
  readonly at: number;
}

export interface MediaViewEvent extends BaseEvent {
  readonly type: 'view';
  readonly item: MediaItem;
  /** Where the view happened — "grid", "lightbox", "reel", or app-defined. */
  readonly surface: string;
}

export interface MediaDownloadEvent extends BaseEvent {
  readonly type: 'download';
  readonly item: MediaItem;
  readonly url: string;
  readonly surface: string;
}

export interface MediaSearchEvent extends BaseEvent {
  readonly type: 'search';
  readonly query: string;
  readonly kind: 'photo' | 'video';
  readonly page: number;
  readonly resultCount: number;
}

export interface MediaErrorEvent extends BaseEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly endpoint: string | undefined;
}

/**
 * The event map. Adding an event here is the only change needed — the emitter,
 * the React hook and the console listener are all generic over this type.
 */
export interface MediaEventMap {
  view: MediaViewEvent;
  download: MediaDownloadEvent;
  search: MediaSearchEvent;
  error: MediaErrorEvent;
}

export type MediaEventName = keyof MediaEventMap;
export type MediaEvent = MediaEventMap[MediaEventName];

export type MediaEventListener<K extends MediaEventName = MediaEventName> = (
  event: MediaEventMap[K],
) => void;

/** Listener for every event, regardless of type. */
export type MediaAnyEventListener = (event: MediaEvent) => void;

/** Returned by every subscribe call. Calling it unsubscribes. Idempotent. */
export type Unsubscribe = () => void;
