/**
 * media-ui-native — headless React Native UI primitives.
 *
 * Same three rules as `media-ui-react`: imports nothing of ours, ships no
 * styles, generic over the item type. Only the mechanism differs — prop-getters
 * return `FlatList` and `Modal` props instead of DOM attributes.
 */

export { useGrid, useLightbox, useReelSwiper, defaultGetItemId } from './hooks.js';
export type {
  UseGridOptions,
  UseLightboxOptions,
  UseReelSwiperOptions,
  GetItemId,
} from './hooks.js';
export { mergeProps } from './mergeProps.js';
