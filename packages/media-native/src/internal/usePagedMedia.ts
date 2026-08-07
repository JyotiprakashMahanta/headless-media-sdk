import { useCallback, useEffect, useReducer, useRef } from 'react';
import { MediaError, type MediaItem, type MediaPage, type RequestOptions } from 'media-core';

/**
 * Paging state machine — the RN twin of the one in `media-react`.
 *
 * The logic is platform-neutral React and is duplicated rather than shared,
 * for the reason given in `MediaProvider.tsx`. The one real difference is at
 * the bottom: `loadMore` here is shaped for `FlatList`'s `onEndReached`, which
 * fires repeatedly during a fling, so the guard matters more than it does on
 * web where an IntersectionObserver fires once.
 */

export interface PagedMediaState {
  items: MediaItem[];
  isLoading: boolean;
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
        items: action.append ? state.items : [],
        error: null,
      };
    case 'success': {
      const seen = new Set(state.items.map((item) => item.id));
      const items = action.append
        ? [...state.items, ...action.page.items.filter((item) => !seen.has(item.id))]
        : [...action.page.items];
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
  fetchPage: ((page: number, options: RequestOptions) => Promise<MediaPage>) | null;
  resetKey: string;
  enabled?: boolean;
}

export interface UsePagedMediaResult extends PagedMediaState {
  loadMore: () => void;
  refresh: () => void;
  /** `FlatList`'s `onEndReached` signature, pre-guarded. */
  onEndReached: () => void;
}

export function usePagedMedia({ fetchPage, resetKey, enabled = true }: UsePagedMediaOptions): UsePagedMediaResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const stateRef = useRef(state);
  stateRef.current = state;

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
        if (token !== requestId.current) return;
        dispatch({ type: 'success', page: result, append });
      } catch (error) {
        if (token !== requestId.current) return;
        const mediaError = MediaError.is(error)
          ? error
          : new MediaError('unknown', error instanceof Error ? error.message : String(error));
        if (mediaError.code === 'aborted') return;
        dispatch({ type: 'failure', error: mediaError });
      }
    },
    [],
  );

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

  return { ...state, loadMore, refresh, onEndReached: loadMore };
}
