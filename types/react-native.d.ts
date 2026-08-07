/**
 * Typecheck shim for `react-native`.
 *
 * WHAT THIS IS, HONESTLY: the React Native packages in this repo declare
 * `react-native` as a peerDependency and do not install it. Installing the RN
 * toolchain (~1GB with pods/gradle) into a monorepo whose only deployable is a
 * web app buys nothing a reviewer can run, so it was cut — see README,
 * "What I cut and why".
 *
 * This file declares exactly the RN surface `media-native` and
 * `media-ui-native` actually use, so those packages still typecheck and still
 * fail the build if they drift. It is NOT a reimplementation and it is not
 * shipped: `types/` is excluded from every package's `dist`.
 *
 * In an app that really installs React Native, RN's own types take precedence
 * and this file is ignored.
 */
declare module 'react-native' {
  import type { ComponentType, Ref } from 'react';

  export interface ViewStyle {
    [key: string]: unknown;
  }

  export interface NativeScrollEvent {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  }

  export interface NativeSyntheticEvent<T> {
    nativeEvent: T;
  }

  export interface LayoutRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface ViewToken<TItem = unknown> {
    item: TItem;
    key: string;
    index: number | null;
    isViewable: boolean;
  }

  export interface ViewabilityConfig {
    itemVisiblePercentThreshold?: number;
    minimumViewTime?: number;
    viewAreaCoveragePercentThreshold?: number;
    waitForInteraction?: boolean;
  }

  export interface FlatListProps<TItem> {
    data?: readonly TItem[] | null;
    renderItem?: (info: { item: TItem; index: number }) => unknown;
    keyExtractor?: (item: TItem, index: number) => string;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onViewableItemsChanged?: (info: { viewableItems: ViewToken<TItem>[] }) => void;
    viewabilityConfig?: ViewabilityConfig;
    pagingEnabled?: boolean;
    snapToInterval?: number;
    snapToAlignment?: 'start' | 'center' | 'end';
    decelerationRate?: 'fast' | 'normal' | number;
    showsVerticalScrollIndicator?: boolean;
    horizontal?: boolean;
    numColumns?: number;
    initialScrollIndex?: number;
    getItemLayout?: (
      data: readonly TItem[] | null | undefined,
      index: number,
    ) => { length: number; offset: number; index: number };
    ref?: Ref<FlatListHandle<TItem>>;
    [key: string]: unknown;
  }

  export interface FlatListHandle<TItem = unknown> {
    scrollToIndex(params: { index: number; animated?: boolean; viewPosition?: number }): void;
    scrollToOffset(params: { offset: number; animated?: boolean }): void;
    _items?: readonly TItem[];
  }

  export const FlatList: ComponentType<FlatListProps<never>> & {
    <TItem>(props: FlatListProps<TItem>): unknown;
  };

  export const Share: {
    share(
      content: { message?: string; url?: string; title?: string },
      options?: { dialogTitle?: string },
    ): Promise<{ action: string; activityType?: string }>;
  };

  export const Linking: {
    openURL(url: string): Promise<void>;
    canOpenURL(url: string): Promise<boolean>;
  };

  export const Dimensions: {
    get(dim: 'window' | 'screen'): { width: number; height: number; scale: number; fontScale: number };
    addEventListener(
      type: 'change',
      handler: (dims: { window: { width: number; height: number } }) => void,
    ): { remove(): void };
  };

  export const Platform: {
    OS: 'ios' | 'android' | 'web' | 'windows' | 'macos';
    select<T>(specifics: { ios?: T; android?: T; default?: T }): T | undefined;
  };

  export const AccessibilityInfo: {
    announceForAccessibility(announcement: string): void;
  };
}
