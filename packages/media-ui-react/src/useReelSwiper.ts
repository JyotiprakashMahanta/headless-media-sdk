import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeProps } from './mergeProps.js';
import { defaultGetItemId, type GetItemId, type PropOverrides } from './types.js';

/**
 * Vertical snap-paging reel (the TikTok/Reels interaction).
 *
 * Active-item detection is the hard part and the reason this is a hook rather
 * than a component. Approaches that do not survive contact with real devices:
 *
 *   - `scrollTop / itemHeight` — wrong the moment items differ in height, and
 *     it fires continuously during momentum scrolling on iOS.
 *   - a `scroll` handler with a debounce — misses the final settle, and burns
 *     main-thread time on every frame of a 60fps flick.
 *
 * What actually works is IntersectionObserver against the scroll container with
 * a high threshold: the browser computes intersection off the main thread, and
 * we only hear about it when an item genuinely occupies most of the viewport.
 * `threshold: 0.6` means exactly one item can qualify at a time.
 *
 * Styling contract — the consumer MUST supply these, since the hook ships no
 * CSS and the interaction does not exist without them:
 *
 *     container { overflow-y: auto; scroll-snap-type: y mandatory; height: 100dvh }
 *     item      { scroll-snap-align: start; height: 100% }
 *
 * The hook adds `data-reel-container` / `data-reel-item` so those selectors can
 * be written against attributes rather than class names.
 */

export interface UseReelSwiperOptions<TItem> {
  items: readonly TItem[];
  getItemId?: GetItemId<TItem>;
  /** Start position. Default 0. */
  initialIndex?: number;
  /** Fires when the active item changes — wire to `trackView`. */
  onActiveChange?: (item: TItem, index: number) => void;
  /** Fraction of the item that must be visible to count as active. Default 0.6. */
  threshold?: number;
  /** Called when the last item becomes active, for endless reels. */
  onReachEnd?: () => void;
  label?: string;
}

export interface UseReelSwiperResult<TItem> {
  activeIndex: number;
  activeItem: TItem | null;
  /** True only for the item that is currently snapped — drive play/pause with this. */
  isActive: (index: number) => boolean;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  next: () => void;
  previous: () => void;
  getContainerProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getItemProps: <P extends PropOverrides>(item: TItem, index: number, overrides?: P) => P & Record<string, unknown>;
}

export function useReelSwiper<TItem>({
  items,
  getItemId = defaultGetItemId,
  initialIndex = 0,
  onActiveChange,
  threshold = 0.6,
  onReachEnd,
  label = 'Reels',
}: UseReelSwiperOptions<TItem>): UseReelSwiperResult<TItem> {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const containerRef = useRef<HTMLElement | null>(null);
  const itemElements = useRef(new Map<number, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const activeChangeRef = useRef(onActiveChange);
  activeChangeRef.current = onActiveChange;
  const reachEndRef = useRef(onReachEnd);
  reachEndRef.current = onReachEnd;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /* ---------------------------------------------------------------------- */
  /* Active detection                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible entry rather than the first: mid-flick, two
        // items can both cross the threshold for a frame.
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset['reelIndex']);
          if (Number.isNaN(index)) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (!best) return;

        setActiveIndex((current) => (current === best!.index ? current : best!.index));
      },
      { root: container, threshold },
    );

    observerRef.current = observer;
    for (const element of itemElements.current.values()) observer.observe(element);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [threshold, items.length]);

  // Notifying listeners lives in its own effect so `onActiveChange` fires once
  // per real change, not once per observer callback.
  const lastNotified = useRef<number | null>(null);
  useEffect(() => {
    const item = itemsRef.current[activeIndex];
    if (item === undefined) return;
    if (lastNotified.current === activeIndex) return;
    lastNotified.current = activeIndex;
    activeChangeRef.current?.(item, activeIndex);
    if (activeIndex === itemsRef.current.length - 1) reachEndRef.current?.();
  }, [activeIndex]);

  /* ---------------------------------------------------------------------- */
  /* Imperative movement                                                    */
  /* ---------------------------------------------------------------------- */

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      itemElements.current.get(clamped)?.scrollIntoView({ behavior, block: 'start' });
    },
    [items.length],
  );

  const next = useCallback(() => scrollToIndex(activeIndex + 1), [activeIndex, scrollToIndex]);
  const previous = useCallback(() => scrollToIndex(activeIndex - 1), [activeIndex, scrollToIndex]);

  // Honour the initial index once the elements exist.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current || items.length === 0 || initialIndex === 0) return;
    didInitialScroll.current = true;
    scrollToIndex(initialIndex, 'auto');
  }, [initialIndex, items.length, scrollToIndex]);

  /* ---------------------------------------------------------------------- */
  /* Prop getters                                                           */
  /* ---------------------------------------------------------------------- */

  const onContainerKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        previous();
      }
    },
    [next, previous],
  );

  const getContainerProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          'data-reel-container': '',
          role: 'list' as const,
          'aria-label': label,
          tabIndex: 0,
          ref: (element: HTMLElement | null) => {
            containerRef.current = element;
          },
          onKeyDown: onContainerKeyDown as (event: unknown) => void,
        },
        overrides,
      ),
    [label, onContainerKeyDown],
  );

  const getItemProps = useCallback(
    <P extends PropOverrides>(item: TItem, index: number, overrides?: P) =>
      mergeProps(
        {
          key: getItemId(item, index),
          role: 'listitem' as const,
          'data-reel-item': '',
          'data-reel-index': index,
          'data-active': index === activeIndex || undefined,
          'aria-current': index === activeIndex ? ('true' as const) : undefined,
          ref: (element: HTMLElement | null) => {
            const observer = observerRef.current;
            const existing = itemElements.current.get(index);
            if (existing && observer) observer.unobserve(existing);

            if (element) {
              itemElements.current.set(index, element);
              observer?.observe(element);
            } else {
              itemElements.current.delete(index);
            }
          },
        },
        overrides,
      ),
    [activeIndex, getItemId],
  );

  return {
    activeIndex,
    activeItem: items[activeIndex] ?? null,
    isActive: (index: number) => index === activeIndex,
    scrollToIndex,
    next,
    previous,
    getContainerProps,
    getItemProps,
  };
}
