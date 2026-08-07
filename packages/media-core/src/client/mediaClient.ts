import { MediaCache, cacheKey } from '../cache/cache.js';
import { MediaEventEmitter, createConsoleEventListener } from '../events/emitter.js';
import type { MediaAnyEventListener, MediaEventListener, MediaEventName, Unsubscribe } from '../events/types.js';
import { MediaError, MediaNotFoundError, toMediaError } from '../errors.js';
import type {
  CuratedQuery,
  MediaItem,
  MediaPage,
  RequestOptions,
  SearchQuery,
} from '../types.js';
import { createHttpClient, type FetchLike, type HttpClient } from './http.js';
import {
  mapPhoto,
  mapPhotoPage,
  mapVideo,
  mapVideoPage,
  parseMediaId,
  type RawPexelsPhoto,
  type RawPexelsPhotoPage,
  type RawPexelsVideo,
  type RawPexelsVideoPage,
} from './pexels.js';

export const DEFAULT_BASE_URL = 'https://api.pexels.com';
const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 80; // Pexels' hard ceiling.

export interface MediaClientConfig {
  /**
   * Pexels API key. Read once, handed to the transport, and never surfaced
   * again — not on the client object, not in events, not in errors.
   */
  readonly apiKey: string;
  readonly baseUrl?: string;
  /** Inject a fetch for tests, a CLI, or a proxy with custom agents. */
  readonly fetch?: FetchLike;
  /** `false` disables caching and de-dupe entirely. */
  readonly cache?: false | { ttlMs?: number; maxEntries?: number };
  /** Attach the built-in console listener. Default `true`. */
  readonly logEvents?: boolean;
  readonly defaultPerPage?: number;
}

export interface DownloadResult {
  readonly url: string;
  /** Suggested filename, e.g. `pexels-joey-farina-2014422.jpg`. */
  readonly filename: string;
  readonly item: MediaItem;
}

/**
 * The whole SDK surface. Deliberately small: four reads, two activity calls,
 * and event/cache access.
 */
export interface MediaClient {
  search(query: SearchQuery, options?: RequestOptions): Promise<MediaPage>;
  curated(query?: CuratedQuery, options?: RequestOptions): Promise<MediaPage>;
  getById(id: string, options?: RequestOptions): Promise<MediaItem>;

  /**
   * Resolves the best download URL and emits `download`.
   *
   * It does NOT save a file: core has no DOM, so anchor-click / Blob / RN
   * FileSystem is the platform's job. Core owns "which URL and what filename",
   * the app owns "how bytes reach the disk". Splitting it here is what keeps
   * the same call working in a browser, in RN and in a CLI.
   */
  download(item: MediaItem, options?: { surface?: string }): DownloadResult;

  /** Records that an item was seen. Emits `view`. */
  trackView(item: MediaItem, options?: { surface?: string }): void;

  on<K extends MediaEventName>(type: K, listener: MediaEventListener<K>): Unsubscribe;
  onAny(listener: MediaAnyEventListener): Unsubscribe;
  readonly events: MediaEventEmitter;

  clearCache(): void;
  cacheStats(): ReturnType<MediaCache['stats']>;

  /** Drops listeners and cached entries. Call on teardown. */
  dispose(): void;
}

const clampPerPage = (value: number | undefined, fallback: number): number =>
  Math.min(Math.max(Math.trunc(value ?? fallback), 1), MAX_PER_PAGE);

function filenameFor(item: MediaItem): string {
  const slug = item.author.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const numericId = item.id.split(':')[1] ?? item.id;
  const extension = item.kind === 'video' ? 'mp4' : 'jpg';
  return `pexels-${slug || 'media'}-${numericId}.${extension}`;
}

export function createMediaClient(config: MediaClientConfig): MediaClient {
  if (!config.apiKey || typeof config.apiKey !== 'string') {
    throw new MediaError(
      'auth',
      'createMediaClient requires an apiKey. Get a free key at https://www.pexels.com/api/.',
    );
  }

  const defaultPerPage = clampPerPage(config.defaultPerPage, DEFAULT_PER_PAGE);
  const events = new MediaEventEmitter();
  const cache = config.cache === false ? null : new MediaCache(config.cache ?? {});

  const http: HttpClient = createHttpClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  if (config.logEvents !== false) {
    events.onAny(createConsoleEventListener());
  }

  /**
   * Every network read funnels through here so that caching, de-dupe and
   * error->event reporting exist in exactly one place rather than being
   * re-implemented per method.
   */
  async function read<TRaw, TOut>(
    path: string,
    params: Record<string, unknown>,
    map: (raw: TRaw) => TOut,
    options: RequestOptions = {},
  ): Promise<TOut> {
    const key = cacheKey(path, params);
    const run = async (): Promise<TOut> => {
      try {
        const raw = await http.get<TRaw>(path, params, options.signal ? { signal: options.signal } : {});
        return map(raw);
      } catch (error) {
        const mediaError = toMediaError(error, http.describe(path, params));
        // Aborts are routine (the user typed another character); they are not
        // an application error and should not spam listeners.
        if (mediaError.code !== 'aborted') {
          events.emit('error', {
            code: mediaError.code,
            message: mediaError.message,
            endpoint: mediaError.endpoint,
          });
        }
        throw mediaError;
      }
    };

    if (!cache) return run();
    return cache.resolve(key, run, options.forceRefresh ? { forceRefresh: true } : {});
  }

  return {
    events,

    async search(query, options = {}) {
      const term = query.query.trim();
      if (!term) {
        // An empty search is a caller mistake, not a provider error — fail fast
        // and locally rather than burning a rate-limited request on it.
        return { items: [], page: 1, perPage: defaultPerPage, totalResults: 0, hasMore: false, nextPage: null };
      }

      const kind = query.kind ?? 'photo';
      const page = Math.max(1, query.page ?? 1);
      const perPage = clampPerPage(query.perPage, defaultPerPage);

      const params: Record<string, unknown> = {
        query: term,
        page,
        per_page: perPage,
        orientation: query.orientation,
        size: query.size,
        locale: query.locale,
      };

      const result =
        kind === 'video'
          ? await read<RawPexelsVideoPage, MediaPage>('/videos/search', params, mapVideoPage, options)
          : await read<RawPexelsPhotoPage, MediaPage>('/v1/search', params, mapPhotoPage, options);

      events.emit('search', { query: term, kind, page, resultCount: result.items.length });
      return result;
    },

    async curated(query = {}, options = {}) {
      const kind = query.kind ?? 'photo';
      const params: Record<string, unknown> = {
        page: Math.max(1, query.page ?? 1),
        per_page: clampPerPage(query.perPage, defaultPerPage),
      };

      return kind === 'video'
        ? read<RawPexelsVideoPage, MediaPage>('/videos/popular', params, mapVideoPage, options)
        : read<RawPexelsPhotoPage, MediaPage>('/v1/curated', params, mapPhotoPage, options);
    },

    async getById(id, options = {}) {
      const { kind, providerId } = parseMediaId(id);
      const path = kind === 'video' ? `/videos/videos/${providerId}` : `/v1/photos/${providerId}`;

      const item =
        kind === 'video'
          ? await read<RawPexelsVideo, MediaItem>(path, {}, mapVideo, options)
          : await read<RawPexelsPhoto, MediaItem>(path, {}, mapPhoto, options);

      if (!item) throw new MediaNotFoundError(`No media item for id "${id}".`, { endpoint: path });
      return item;
    },

    download(item, options = {}) {
      const result: DownloadResult = {
        url: item.downloadUrl,
        filename: filenameFor(item),
        item,
      };
      events.emit('download', {
        item,
        url: result.url,
        surface: options.surface ?? 'unknown',
      });
      return result;
    },

    trackView(item, options = {}) {
      events.emit('view', { item, surface: options.surface ?? 'unknown' });
    },

    on(type, listener) {
      return events.on(type, listener);
    },

    onAny(listener) {
      return events.onAny(listener);
    },

    clearCache() {
      cache?.clear();
    },

    cacheStats() {
      return cache?.stats() ?? { size: 0, inflight: 0, hits: 0, misses: 0, deduped: 0 };
    },

    dispose() {
      events.removeAllListeners();
      cache?.clear();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Optional module-level singleton                                            */
/* -------------------------------------------------------------------------- */

let singleton: MediaClient | null = null;

/**
 * Convenience init for consumers with one client per process — scripts, CLIs,
 * quick demos.
 *
 * The React wrapper does NOT use this: a module singleton is invisible to
 * tests, breaks SSR request isolation, and makes two differently-configured
 * clients impossible. `MediaProvider` calls `createMediaClient` instead. Both
 * exist because both are legitimate, and the docs say which to reach for.
 */
export function configureMedia(config: MediaClientConfig): MediaClient {
  singleton?.dispose();
  singleton = createMediaClient(config);
  return singleton;
}

export function getMediaClient(): MediaClient {
  if (!singleton) {
    throw new MediaError('unknown', 'configureMedia({ apiKey }) must be called before getMediaClient().');
  }
  return singleton;
}

export function resetMediaClient(): void {
  singleton?.dispose();
  singleton = null;
}
