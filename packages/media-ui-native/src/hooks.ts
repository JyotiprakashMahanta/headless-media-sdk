import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, type FlatListHandle, type ViewToken } from 'react-native';
import { mergeProps } from './mergeProps.js';

/**
 * Headless primitives for React Native.
 *
 * Same three components as the web library, same headless contract: generic
 * over the item type, zero styles, prop-getters only. What changes is what a
 * prop-getter returns — on web it is DOM attributes and an IntersectionObserver
 * ref; here it is `FlatList` props and viewability config.
 *
 * That is exactly the split the brief is testing. The *behaviour* (infinite
 * scroll, active-item detection, focus/dismiss handling) is the same product
 * decision on both platforms; the *mechanism* is completely different, and none
 * of it belongs in `media-core`.
 */

export type GetItemId<TItem> = (item: TItem, index: number) => string;

export function defaultGetItemId<TItem>(item: TItem, index: number): string {
  if (item !== null && typeof item === 'object' && 'id' in item) {
    const id = (item as { id: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return String(index);
}

type PropOverrides = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Grid                                                                       */
/* -------------------------------------------------------------------------- */

export interface UseGridOptions<TItem> {
  items: readonly TItem[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect?: (item: TItem, index: number) => void;
  onItemVisible?: (item: TItem, index: number) => void;
  getItemId?: GetItemId<TItem>;
  columns?: number;
  /** Screens-from-the-end that triggers `onLoadMore`. Default 0.5. */
  endThreshold?: number;
}

export function useGrid<TItem>({
  items,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelect,
  onItemVisible,
  getItemId = defaultGetItemId,
  columns = 2,
  endThreshold = 0.5,
}: UseGridOptions<TItem>) {
  const seenRef = useRef(new Set<string>());
  const visibleRef = useRef(onItemVisible);
  visibleRef.current = onItemVisible;

  // `onEndReached` fires repeatedly during a fling on both platforms; without
  // this guard a fast scroll requests the same page three or four times.
  const onEndReached = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    onLoadMore?.();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TItem>[] }) => {
      if (!visibleRef.current) return;
      for (const token of viewableItems) {
        if (!token.isViewable || token.index === null) continue;
        const id = getItemId(token.item, token.index);
        if (seenRef.current.has(id)) continue;
        seenRef.current.add(id);
        visibleRef.current(token.item, token.index);
      }
    },
    [getItemId],
  );

  // Identity must be stable for the lifetime of the list: RN throws
  // "Changing onViewableItemsChanged on the fly is not supported" otherwise.
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 50, minimumViewTime: 200 }), []);

  const getListProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          data: items,
          numColumns: columns,
          keyExtractor: getItemId,
          onEndReached,
          onEndReachedThreshold: endThreshold,
          onViewableItemsChanged,
          viewabilityConfig,
          accessibilityRole: 'list',
        },
        overrides,
      ),
    [items, columns, getItemId, onEndReached, endThreshold, onViewableItemsChanged, viewabilityConfig],
  );

  const getItemProps = useCallback(
    <P extends PropOverrides>(item: TItem, index: number, overrides?: P) =>
      mergeProps(
        {
          accessibilityRole: 'imagebutton',
          accessible: true,
          onPress: () => onSelect?.(item, index),
        },
        overrides,
      ),
    [onSelect],
  );

  return { getListProps, getItemProps, isEmpty: items.length === 0 };
}

/* -------------------------------------------------------------------------- */
/* Lightbox                                                                   */
/* -------------------------------------------------------------------------- */

export interface UseLightboxOptions<TItem> {
  items: readonly TItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onItemView?: (item: TItem, index: number) => void;
  loop?: boolean;
}

/**
 * There is no focus trap to build here — RN's `Modal` owns focus and the
 * hardware back button. What the hook still owns is navigation bounds, the
 * `onRequestClose` wiring (Android back button; forgetting it is the single
 * most common RN modal bug), and reporting views.
 */
export function useLightbox<TItem>({
  items,
  index,
  onIndexChange,
  onClose,
  onItemView,
  loop = false,
}: UseLightboxOptions<TItem>) {
  const isOpen = index !== null && index >= 0 && index < items.length;
  const activeItem = isOpen ? (items[index] ?? null) : null;

  const hasNext = isOpen && (loop || index < items.length - 1);
  const hasPrevious = isOpen && (loop || index > 0);

  const viewRef = useRef(onItemView);
  viewRef.current = onItemView;
  const lastViewed = useRef<number | null>(null);

  // In an effect, not during render: calling a parent's callback while
  // rendering is a "cannot update a component while rendering another" warning
  // in development and a real ordering hazard in concurrent React.
  useEffect(() => {
    if (!isOpen || index === null || !activeItem) {
      lastViewed.current = null;
      return;
    }
    if (lastViewed.current === index) return;
    lastViewed.current = index;
    viewRef.current?.(activeItem, index);
  }, [isOpen, index, activeItem]);

  const next = useCallback(() => {
    if (index === null) return;
    if (index + 1 < items.length) onIndexChange(index + 1);
    else if (loop) onIndexChange(0);
  }, [index, items.length, loop, onIndexChange]);

  const previous = useCallback(() => {
    if (index === null) return;
    if (index - 1 >= 0) onIndexChange(index - 1);
    else if (loop) onIndexChange(items.length - 1);
  }, [index, items.length, loop, onIndexChange]);

  const getModalProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          visible: isOpen,
          transparent: true,
          animationType: 'fade',
          // Android hardware back. Omitting this is why so many RN modals
          // cannot be dismissed with the back gesture.
          onRequestClose: onClose,
          accessibilityViewIsModal: true,
        },
        overrides,
      ),
    [isOpen, onClose],
  );

  const getBackdropProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps({ accessible: false, onPress: onClose }, overrides),
    [onClose],
  );

  const getCloseButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        { accessibilityRole: 'button', accessibilityLabel: 'Close viewer', onPress: onClose },
        overrides,
      ),
    [onClose],
  );

  const getNextButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          accessibilityRole: 'button',
          accessibilityLabel: 'Next item',
          accessibilityState: { disabled: !hasNext },
          disabled: !hasNext,
          onPress: next,
        },
        overrides,
      ),
    [hasNext, next],
  );

  const getPreviousButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          accessibilityRole: 'button',
          accessibilityLabel: 'Previous item',
          accessibilityState: { disabled: !hasPrevious },
          disabled: !hasPrevious,
          onPress: previous,
        },
        overrides,
      ),
    [hasPrevious, previous],
  );

  return {
    isOpen,
    activeItem,
    activeIndex: isOpen ? index : null,
    hasNext,
    hasPrevious,
    next,
    previous,
    close: onClose,
    getModalProps,
    getBackdropProps,
    getCloseButtonProps,
    getNextButtonProps,
    getPreviousButtonProps,
  };
}

/* -------------------------------------------------------------------------- */
/* Reel swiper                                                                */
/* -------------------------------------------------------------------------- */

export interface UseReelSwiperOptions<TItem> {
  items: readonly TItem[];
  getItemId?: GetItemId<TItem>;
  initialIndex?: number;
  onActiveChange?: (item: TItem, index: number) => void;
  onReachEnd?: () => void;
  /** Page height. Defaults to the window height. */
  itemHeight?: number;
}

/**
 * Vertical full-screen paging.
 *
 * `onViewableItemsChanged` with a high `itemVisiblePercentThreshold` is the RN
 * equivalent of the web version's IntersectionObserver, and it is chosen for
 * the same reason: it is computed natively, so a 60fps fling does not run JS
 * per frame. `getItemLayout` is supplied because every page is the same height
 * — that lets RN honour `initialScrollIndex` without measuring, which is what
 * makes deep-linking into the middle of a reel instant instead of janky.
 */
export function useReelSwiper<TItem>({
  items,
  getItemId = defaultGetItemId,
  initialIndex = 0,
  onActiveChange,
  onReachEnd,
  itemHeight,
}: UseReelSwiperOptions<TItem>) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatListHandle<TItem> | null>(null);

  const height = itemHeight ?? Dimensions.get('window').height;

  const activeChangeRef = useRef(onActiveChange);
  activeChangeRef.current = onActiveChange;
  const reachEndRef = useRef(onReachEnd);
  reachEndRef.current = onReachEnd;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TItem>[] }) => {
      const first = viewableItems.find((token) => token.isViewable && token.index !== null);
      if (!first || first.index === null) return;
      setActiveIndex(first.index);
      activeChangeRef.current?.(first.item, first.index);
      if (first.index === items.length - 1) reachEndRef.current?.();
    },
    [items.length],
  );

  // 80%: at full-screen paging only one item can ever clear this, so the
  // "which one is active" question has exactly one answer per settle.
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 80 }), []);

  const scrollToIndex = useCallback((index: number, animated = true) => {
    listRef.current?.scrollToIndex({ index, animated });
  }, []);

  const getListProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          ref: (instance: FlatListHandle<TItem> | null) => {
            listRef.current = instance;
          },
          data: items,
          keyExtractor: getItemId,
          pagingEnabled: true,
          snapToInterval: height,
          snapToAlignment: 'start' as const,
          decelerationRate: 'fast' as const,
          showsVerticalScrollIndicator: false,
          initialScrollIndex: initialIndex,
          getItemLayout: (_data: unknown, index: number) => ({
            length: height,
            offset: height * index,
            index,
          }),
          onViewableItemsChanged,
          viewabilityConfig,
        },
        overrides,
      ),
    [items, getItemId, height, initialIndex, onViewableItemsChanged, viewabilityConfig],
  );

  const getItemProps = useCallback(
    <P extends PropOverrides>(item: TItem, index: number, overrides?: P) =>
      mergeProps(
        {
          // The consumer still writes the style; we only tell them the height
          // the paging maths assumes, so the two cannot drift.
          style: { height },
          accessible: true,
          accessibilityState: { selected: index === activeIndex },
        },
        overrides,
      ),
    [height, activeIndex],
  );

  return {
    activeIndex,
    activeItem: items[activeIndex] ?? null,
    isActive: (index: number) => index === activeIndex,
    itemHeight: height,
    scrollToIndex,
    next: () => scrollToIndex(activeIndex + 1),
    previous: () => scrollToIndex(activeIndex - 1),
    getListProps,
    getItemProps,
  };
}
