import type {
  MediaAnyEventListener,
  MediaEvent,
  MediaEventListener,
  MediaEventMap,
  MediaEventName,
  Unsubscribe,
} from './types.js';

/**
 * Minimal typed event emitter.
 *
 * Written by hand rather than pulled from `mitt`/`eventemitter3` for three
 * reasons: `media-core` ships zero runtime dependencies, Node's `EventEmitter`
 * would tie us to Node, and the typing we want (payload inferred from event
 * name) is ~40 lines.
 *
 * Design notes:
 * - `on()` returns an unsubscribe function. No "remember to pass the same
 *   reference to `off()`" footgun, and it drops straight into React's
 *   `useEffect` cleanup.
 * - Listeners are copied before dispatch, so subscribing/unsubscribing from
 *   inside a listener cannot corrupt the current dispatch.
 * - A throwing listener never breaks the SDK or the other listeners.
 */
export class MediaEventEmitter {
  #listeners = new Map<MediaEventName, Set<MediaEventListener<never>>>();
  #anyListeners = new Set<MediaAnyEventListener>();
  #onListenerError: (error: unknown, event: MediaEvent) => void;

  constructor(options: { onListenerError?: (error: unknown, event: MediaEvent) => void } = {}) {
    this.#onListenerError =
      options.onListenerError ??
      ((error) => {
        console.error('[media-core] event listener threw:', error);
      });
  }

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on<K extends MediaEventName>(type: K, listener: MediaEventListener<K>): Unsubscribe {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    const entry = listener as unknown as MediaEventListener<never>;
    set.add(entry);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(entry);
      if (set.size === 0) this.#listeners.delete(type);
    };
  }

  /** Subscribe to every event. Useful for analytics sinks and the dev logger. */
  onAny(listener: MediaAnyEventListener): Unsubscribe {
    this.#anyListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#anyListeners.delete(listener);
    };
  }

  /** Fires at most once, then unsubscribes itself. */
  once<K extends MediaEventName>(type: K, listener: MediaEventListener<K>): Unsubscribe {
    const off = this.on(type, ((event: MediaEventMap[K]) => {
      off();
      listener(event);
    }) as MediaEventListener<K>);
    return off;
  }

  /** Explicit removal, for consumers that prefer symmetric on/off. */
  off<K extends MediaEventName>(type: K, listener: MediaEventListener<K>): void {
    const set = this.#listeners.get(type);
    if (!set) return;
    set.delete(listener as unknown as MediaEventListener<never>);
    if (set.size === 0) this.#listeners.delete(type);
  }

  /**
   * Emit an event. `at` is stamped here so callers never have to, and so every
   * listener sees the same timestamp for the same event.
   */
  emit<K extends MediaEventName>(
    type: K,
    payload: Omit<MediaEventMap[K], 'type' | 'at'>,
  ): void {
    const event = { ...payload, type, at: Date.now() } as MediaEventMap[K];

    // Copy before dispatch: a listener may unsubscribe itself mid-flight.
    const direct = this.#listeners.get(type);
    if (direct) {
      for (const listener of [...direct]) {
        try {
          (listener as unknown as MediaEventListener<K>)(event);
        } catch (error) {
          this.#onListenerError(error, event);
        }
      }
    }

    for (const listener of [...this.#anyListeners]) {
      try {
        listener(event);
      } catch (error) {
        this.#onListenerError(error, event);
      }
    }
  }

  /** Live listener count — handy in tests to assert no leaks. */
  listenerCount(type?: MediaEventName): number {
    if (type === undefined) {
      let total = this.#anyListeners.size;
      for (const set of this.#listeners.values()) total += set.size;
      return total;
    }
    return this.#listeners.get(type)?.size ?? 0;
  }

  /** Drops every listener. Called by `client.dispose()`. */
  removeAllListeners(): void {
    this.#listeners.clear();
    this.#anyListeners.clear();
  }
}

/**
 * The default listener required by the brief: logs every event to the console.
 *
 * Attached automatically unless `configureMedia({ logEvents: false })`. Kept as
 * a plain function so the app can also attach it manually, or wrap it.
 */
export function createConsoleEventListener(
  prefix = '[media]',
): MediaAnyEventListener {
  return (event) => {
    switch (event.type) {
      case 'view':
        console.log(`${prefix} view`, { id: event.item.id, kind: event.item.kind, surface: event.surface });
        break;
      case 'download':
        console.log(`${prefix} download`, { id: event.item.id, url: event.url, surface: event.surface });
        break;
      case 'search':
        console.log(`${prefix} search`, { query: event.query, kind: event.kind, page: event.page, results: event.resultCount });
        break;
      case 'error':
        console.warn(`${prefix} error`, { code: event.code, message: event.message, endpoint: event.endpoint });
        break;
    }
  };
}
