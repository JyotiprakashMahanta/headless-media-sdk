import { useCallback, useEffect, useReducer, useRef } from 'react';
import { MediaError, type MediaItem, type MediaPage, type RequestOptions } from 'media-core';

/**
 * The paging state machine shared by `useMediaSearch` and `useCuratedMedia`.
 *
 * This is React plumbing, not business logic: the *fetching* lives in
 * `media-core`, and this file only solves problems that exist because React
 * renders concurrently — stale responses, aborting on unmount, distinguishing
 * "first load" from "loading page 4", and keeping `loadMore` referentially
 * stable so a memoised grid does not re-render on every keystroke.
 */

export interface PagedMediaState {
  items: MediaItem[];
  /** True only for the first page of a given input. Drives skeletons. */
  isLoading: boolean;
  /** True while appending. Drives the "loading more…" row. */
  isLoadingMore: boolean;
  error: MediaError | null;
  hasMore: boolean;
  page: number;
  totalResults: number | null;
}

type Action =
  | { type: 'reset' }
  | { type: 'start'; append: boolean }
  | { type: 'success'; page: MediaPage; append: boolean }
  | { type: 'failure'; error: MediaError };

const INITIAL: PagedMediaState = {
  items: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  hasMore: false,
  page: 0,
  totalResults: null,
};

function reducer(state: PagedMediaState, action: Action): PagedMediaState {
  switch (action.type) {
    case 'reset':
      return INITIAL;

    case 'start':
      return {
        ...state,
        isLoading: !action.append,
        isLoadingMore: action.append,
        // Keep previous items while appending so the grid does not collapse;
        // clear them on a new query so results never look mixed.
        items: action.append ? state.items : [],
        error: null,
      };

    case 'success': {
      const incoming = action.page.items;
      let items: MediaItem[];
      if (action.append) {
        // Pexels can repeat an item across pages when the index shifts mid-scroll.
        // De-duplicating here prevents React key collisions in the consumer.
        const seen = new Set(state.items.map((item) => item.id));
        items = [...state.items, ...incoming.filter((item) => !seen.has(item.id))];
      } else {
        items = [...incoming];
      }
      return {
        items,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        hasMore: action.page.hasMore,
        page: action.page.page,
        totalResults: action.page.totalResults,
      };
    }

    case 'failure':
      return { ...state, isLoading: false, isLoadingMore: false, error: action.error };

    default:
      return state;
  }
}

export interface UsePagedMediaOptions {
  /** `null` means "do not fetch" (empty query, disabled). */
  fetchPage: ((page: number, options: RequestOptions) => Promise<MediaPage>) | null;
  /** Changing this string resets to page 1. Identity of `fetchPage` is ignored. */
  resetKey: string;
  enabled?: boolean;
}

export interface UsePagedMediaResult extends PagedMediaState {
  loadMore: () => void;
  refresh: () => void;
}

export function usePagedMedia({ fetchPage, resetKey, enabled = true }: UsePagedMediaOptions): UsePagedMediaResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Refs, not deps: these change every render but must not restart the effect.
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const stateRef = useRef(state);
  stateRef.current = state;

  // Monotonic token: a response whose token is stale is dropped. Aborting is
  // not sufficient on its own, because an already-resolved promise can still
  // land after the input changed.
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (page: number, { append, forceRefresh }: { append: boolean; forceRefresh?: boolean }) => {
      const fetcher = fetchRef.current;
      if (!fetcher) {
        dispatch({ type: 'reset' });
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const token = ++requestId.current;
      dispatch({ type: 'start', append });

      try {
        const result = await fetcher(page, {
          signal: controller.signal,
          ...(forceRefresh ? { forceRefresh: true } : {}),
        });
        if (token !== requestId.current) return; // superseded
        dispatch({ type: 'success', page: result, append });
      } catch (error) {
        if (token !== requestId.current) return;
        const mediaError = MediaError.is(error)
          ? error
          : new MediaError('unknown', error instanceof Error ? error.message : String(error));
        if (mediaError.code === 'aborted') return; // routine, not user-facing
        dispatch({ type: 'failure', error: mediaError });
      }
    },
    [],
  );

  // First page, and re-run whenever the inputs that define the query change.
  useEffect(() => {
    if (!enabled || !fetchRef.current) {
      dispatch({ type: 'reset' });
      return;
    }
    void run(1, { append: false });
    return () => {
      controllerRef.current?.abort();
    };
  }, [resetKey, enabled, run]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (current.isLoading || current.isLoadingMore || !current.hasMore) return;
    void run(current.page + 1, { append: true });
  }, [run]);

  const refresh = useCallback(() => {
    void run(1, { append: false, forceRefresh: true });
  }, [run]);

  return { ...state, loadMore, refresh };
}
