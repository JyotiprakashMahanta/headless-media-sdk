/**
 * In-memory response cache + in-flight request de-duplication.
 *
 * Two distinct problems, solved together because they share a key:
 *
 *   1. Caching — the same page of the same search inside the TTL should not hit
 *      the network twice. Grids are re-mounted constantly (route changes, tab
 *      switches, StrictMode double-effects) and Pexels has a real rate limit.
 *   2. De-duplication — if three components ask for the same page in the same
 *      tick, exactly one request should go out and all three should await it.
 *      Without this, React 18 StrictMode alone doubles every request in dev.
 *
 * A plain `Map` with an LRU-ish cap is enough. No `localStorage`, no IndexedDB:
 * core must run in a CLI or a worker, and persistence is a policy decision that
 * belongs to whoever embeds the SDK, not to the SDK.
 */

export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface MediaCacheOptions {
  /** Milliseconds an entry stays fresh. Default 5 minutes. */
  readonly ttlMs?: number;
  /** Hard cap on entries; oldest inserted are evicted first. Default 200. */
  readonly maxEntries?: number;
  /** Injectable clock so tests do not need timers. */
  readonly now?: () => number;
}

export class MediaCache {
  #entries = new Map<string, CacheEntry<unknown>>();
  #inflight = new Map<string, Promise<unknown>>();
  #ttlMs: number;
  #maxEntries: number;
  #now: () => number;

  #hits = 0;
  #misses = 0;
  #deduped = 0;

  constructor(options: MediaCacheOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.#maxEntries = options.maxEntries ?? 200;
    this.#now = options.now ?? (() => Date.now());
  }

  get<T>(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so hot keys survive eviction.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
  }

  /**
   * The one method callers actually use.
   *
   * - Fresh cache hit  -> resolved immediately, `factory` never runs.
   * - Request in flight -> returns the *same* promise, `factory` never runs.
   * - Otherwise         -> runs `factory`, shares the promise, caches the result.
   *
   * A rejected request is removed from the in-flight map and never cached, so a
   * transient failure does not poison the key.
   */
  async resolve<T>(key: string, factory: () => Promise<T>, options: { forceRefresh?: boolean } = {}): Promise<T> {
    if (!options.forceRefresh) {
      const cached = this.get<T>(key);
      if (cached !== undefined) {
        this.#hits += 1;
        return cached;
      }

      const pending = this.#inflight.get(key);
      if (pending) {
        this.#deduped += 1;
        return pending as Promise<T>;
      }
    }

    this.#misses += 1;

    const promise = factory()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.#inflight.delete(key);
      });

    this.#inflight.set(key, promise);
    return promise;
  }

  /** Drop one key, or every key whose name starts with `prefix`. */
  invalidate(keyOrPrefix: string, { prefix = false } = {}): void {
    if (!prefix) {
      this.#entries.delete(keyOrPrefix);
      return;
    }
    for (const key of this.#entries.keys()) {
      if (key.startsWith(keyOrPrefix)) this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#inflight.clear();
  }

  /** Exposed for the docs site and for asserting de-dupe in tests. */
  stats(): { size: number; inflight: number; hits: number; misses: number; deduped: number } {
    return {
      size: this.#entries.size,
      inflight: this.#inflight.size,
      hits: this.#hits,
      misses: this.#misses,
      deduped: this.#deduped,
    };
  }
}

/**
 * Builds a stable cache key from an endpoint and its params.
 *
 * Params are sorted so `?a=1&b=2` and `?b=2&a=1` share an entry, and undefined
 * values are dropped. The API key is deliberately NOT part of the key — it is
 * not an input to the response shape, and cache keys end up in logs.
 */
export function cacheKey(endpoint: string, params: Record<string, unknown> = {}): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (pairs.length === 0) return endpoint;
  return `${endpoint}?${pairs.map(([k, v]) => `${k}=${v}`).join('&')}`;
}
