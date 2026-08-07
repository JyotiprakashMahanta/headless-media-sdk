/**
 * Domain model.
 *
 * These types are OURS, not Pexels'. Nothing outside `src/client/pexels.ts`
 * ever sees a raw Pexels payload. That mapping layer is the reason swapping to
 * Unsplash (or a fixture file, or a CLI) is a transport change and not a
 * rewrite of every consumer.
 */

export type MediaKind = 'photo' | 'video';

/** A renderable source for an item, smallest-to-largest by convention. */
export interface MediaRendition {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Present for video renditions only. */
  readonly mimeType?: string;
}

export interface MediaAuthor {
  readonly id: string;
  readonly name: string;
  readonly profileUrl: string;
}

/**
 * The single shape every consumer works with, for both photos and videos.
 * Components take this as a prop; they never learn where it came from.
 */
export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  /** Canonical page on the provider — used for attribution links. */
  readonly sourceUrl: string;
  readonly width: number;
  readonly height: number;
  /** Ratio helper so grids can reserve space before the image loads. */
  readonly aspectRatio: number;
  /** Average colour, useful as a placeholder background. Photos only. */
  readonly placeholderColor: string | null;
  readonly alt: string;
  readonly author: MediaAuthor;
  /** Small preview, always safe to use in a grid. */
  readonly thumbnailUrl: string;
  /** Best display-size rendition. */
  readonly previewUrl: string;
  /** Highest quality rendition — what `download` should hand back. */
  readonly downloadUrl: string;
  /** Seconds. Videos only. */
  readonly durationSeconds: number | null;
  /** All available renditions, ascending by width. */
  readonly renditions: readonly MediaRendition[];
}

/** Cursor-ish pagination envelope returned by every list call. */
export interface MediaPage {
  readonly items: readonly MediaItem[];
  readonly page: number;
  readonly perPage: number;
  /** Provider's reported total. `null` when the provider does not say. */
  readonly totalResults: number | null;
  readonly hasMore: boolean;
  /** `null` when there is nothing after this page. */
  readonly nextPage: number | null;
}

export type MediaOrientation = 'landscape' | 'portrait' | 'square';
export type MediaSize = 'large' | 'medium' | 'small';

export interface SearchQuery {
  readonly query: string;
  readonly kind?: MediaKind;
  readonly page?: number;
  readonly perPage?: number;
  readonly orientation?: MediaOrientation;
  readonly size?: MediaSize;
  /** ISO 639-1, e.g. "en", "hi". */
  readonly locale?: string;
}

export interface CuratedQuery {
  readonly kind?: MediaKind;
  readonly page?: number;
  readonly perPage?: number;
}

/** Per-call options every public method accepts. */
export interface RequestOptions {
  readonly signal?: AbortSignalLike;
  /** Skip the cache for this call and refill it with the response. */
  readonly forceRefresh?: boolean;
}

/**
 * Structural stand-in for `AbortSignal`.
 *
 * Typed by hand rather than pulled from `lib.dom` so this package compiles with
 * `"lib": ["ES2022"]` and stays honest about not needing a browser.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
