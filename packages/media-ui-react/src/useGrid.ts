import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeProps } from './mergeProps.js';
import { defaultGetItemId, type GetItemId, type PropOverrides } from './types.js';

/**
 * Grid with infinite scroll + roving-tabindex keyboard navigation.
 *
 * Ships NO styles. The consumer writes the CSS Grid / flex / masonry; this hook
 * owns only the parts that are tedious and easy to get wrong:
 *
 *   - "we are near the end, ask for more" via IntersectionObserver on a
 *     sentinel element, guarded so it cannot fire while a load is in flight
 *   - list/listitem semantics and a live region announcing new results
 *   - arrow-key navigation with a roving tabindex, so the grid is one tab stop
 *     rather than N, and Enter/Space open an item
 *
 * Styling contract (documented, not enforced): the sentinel must be inside the
 * scroll container and must have non-zero height, or IntersectionObserver will
 * never fire. The components docs site shows a 1px-tall sentinel.
 */

export interface UseGridOptions<TItem> {
  items: readonly TItem[];
  /** More pages exist. When false, the sentinel stops observing. */
  hasMore?: boolean;
  /** A page is currently loading — suppresses duplicate `onLoadMore` calls. */
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Fires on click and on Enter/Space. */
  onSelect?: (item: TItem, index: number) => void;
  /**
   * Fires the first time an item scrolls into view. The app wires this to the
   * SDK's `trackView` — the hook itself has no idea what that means.
   */
  onItemVisible?: (item: TItem, index: number) => void;
  getItemId?: GetItemId<TItem>;
  /** How early to trigger `onLoadMore`. CSS margin syntax. Default "400px". */
  rootMargin?: string;
  /** Columns, used only for Up/Down arrow maths. Default 1 (Up/Down = Left/Right). */
  columns?: number;
  /** Accessible name for the grid. Default "Media results". */
  label?: string;
}

export interface UseGridResult<TItem> {
  getGridProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getItemProps: <P extends PropOverrides>(item: TItem, index: number, overrides?: P) => P & Record<string, unknown>;
  /** Spread onto an empty element at the end of the list. */
  getSentinelProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  /** Spread onto a visually-hidden element to announce result counts. */
  getStatusProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  isEmpty: boolean;
}

export function useGrid<TItem>({
  items,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelect,
  onItemVisible,
  getItemId = defaultGetItemId,
  rootMargin = '400px',
  columns = 1,
  label = 'Media results',
}: UseGridOptions<TItem>): UseGridResult<TItem> {
  const [activeIndex, setActiveIndex] = useState(0);
  const sentinelRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());

  // Refs so the observers below never need to be torn down and rebuilt just
  // because the parent re-rendered with a new inline callback.
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;
  const canLoadRef = useRef({ hasMore, isLoadingMore });
  canLoadRef.current = { hasMore, isLoadingMore };

  /* ---------------------------------------------------------------------- */
  /* Infinite scroll                                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return; // SSR / jsdom

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        const { hasMore: more, isLoadingMore: loading } = canLoadRef.current;
        if (!more || loading) return;
        loadMoreRef.current?.();
      },
      { rootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // `items.length` is a dependency because the sentinel can already be inside
    // the viewport after a short page renders; re-observing re-fires it.
  }, [hasMore, rootMargin, items.length]);

  /* ---------------------------------------------------------------------- */
  /* First-view tracking                                                    */
  /* ---------------------------------------------------------------------- */

  const seenRef = useRef(new Set<string>());
  const visibleRef = useRef(onItemVisible);
  visibleRef.current = onItemVisible;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const observeVisibility = useCallback(
    (element: HTMLElement | null, id: string, index: number) => {
      if (!element || !visibleRef.current || seenRef.current.has(id)) return;
      if (typeof IntersectionObserver === 'undefined') return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return;
          if (seenRef.current.has(id)) return;
          seenRef.current.add(id);
          const item = itemsRef.current[index];
          if (item !== undefined) visibleRef.current?.(item, index);
          observer.disconnect();
        },
        { threshold: 0.5 },
      );
      observer.observe(element);
    },
    [],
  );

  /* ---------------------------------------------------------------------- */
  /* Keyboard navigation                                                    */
  /* ---------------------------------------------------------------------- */

  const focusIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      setActiveIndex(clamped);
      const item = items[clamped];
      if (item === undefined) return;
      itemRefs.current.get(getItemId(item, clamped))?.focus();
    },
    [items, getItemId],
  );

  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: Math.max(1, columns),
        ArrowUp: -Math.max(1, columns),
      };
      const delta = step[event.key];
      if (delta !== undefined) {
        event.preventDefault();
        focusIndex(activeIndex + delta);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        focusIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusIndex(items.length - 1);
      }
    },
    [activeIndex, columns, focusIndex, items.length],
  );

  /* ---------------------------------------------------------------------- */
  /* Prop getters                                                           */
  /* ---------------------------------------------------------------------- */

  const getGridProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          role: 'list' as const,
          'aria-label': label,
          'aria-busy': isLoadingMore || undefined,
          onKeyDown: onGridKeyDown as (event: unknown) => void,
        },
        overrides,
      ),
    [label, isLoadingMore, onGridKeyDown],
  );

  const getItemProps = useCallback(
    <P extends PropOverrides>(item: TItem, index: number, overrides?: P) => {
      const id = getItemId(item, index);
      return mergeProps(
        {
          role: 'listitem' as const,
          key: id,
          'data-index': index,
          'data-active': index === activeIndex || undefined,
          // Roving tabindex: exactly one item is tabbable, so a 200-item grid
          // is one tab stop instead of 200.
          tabIndex: index === activeIndex ? 0 : -1,
          ref: (element: HTMLElement | null) => {
            if (element) {
              itemRefs.current.set(id, element);
              observeVisibility(element, id, index);
            } else {
              itemRefs.current.delete(id);
            }
          },
          onClick: () => {
            setActiveIndex(index);
            onSelect?.(item, index);
          },
          onFocus: () => setActiveIndex(index),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect?.(item, index);
            }
          },
        },
        overrides,
      );
    },
    [activeIndex, getItemId, observeVisibility, onSelect],
  );

  const getSentinelProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          ref: (element: HTMLElement | null) => {
            sentinelRef.current = element;
          },
          'aria-hidden': true,
          'data-sentinel': '',
        },
        overrides,
      ),
    [],
  );

  const status = useMemo(() => {
    if (items.length === 0) return 'No results';
    return `${items.length} result${items.length === 1 ? '' : 's'} loaded${isLoadingMore ? ', loading more' : ''}`;
  }, [items.length, isLoadingMore]);

  const getStatusProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps({ role: 'status' as const, 'aria-live': 'polite' as const, children: status }, overrides),
    [status],
  );

  return {
    getGridProps,
    getItemProps,
    getSentinelProps,
    getStatusProps,
    activeIndex,
    setActiveIndex,
    isEmpty: items.length === 0,
  };
}
