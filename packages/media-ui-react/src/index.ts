/**
 * media-ui-react — headless UI primitives.
 *
 * Three rules define this package:
 *
 *   1. It imports nothing of ours. No `media-core`, no `media-react`. Its only
 *      peer dependency is React. `scripts/check-boundaries.mjs` enforces this.
 *   2. It ships no styles. Not a stylesheet, not a Tailwind class, not an
 *      inline style. Every hook returns prop-getters; the consumer owns markup
 *      and CSS entirely.
 *   3. It is generic over the item type. These hooks do not know what a "photo"
 *      is — they take `readonly TItem[]` and a way to get an id.
 *
 * What it DOES ship is the part that is genuinely hard: focus trapping and
 * restoration, roving tabindex, IntersectionObserver-based infinite scroll and
 * active-item detection, and prop merging that lets a consumer override any of
 * it without forking.
 */

export { useGrid } from './useGrid.js';
export type { UseGridOptions, UseGridResult } from './useGrid.js';

export { useLightbox } from './useLightbox.js';
export type { UseLightboxOptions, UseLightboxResult } from './useLightbox.js';

export { useReelSwiper } from './useReelSwiper.js';
export type { UseReelSwiperOptions, UseReelSwiperResult } from './useReelSwiper.js';

export { mergeProps } from './mergeProps.js';
export { defaultGetItemId } from './types.js';
export type { GetItemId, PropOverrides } from './types.js';
