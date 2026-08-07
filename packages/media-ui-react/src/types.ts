/**
 * These components are generic over the item type on purpose.
 *
 * `media-ui-react` must not import `media-core`, so it cannot reference
 * `MediaItem`. Rather than inventing a duplicate media type here (which would
 * couple the two by copy-paste instead of by import — same problem, worse),
 * every hook is generic over `TItem` and asks for the one thing it genuinely
 * needs: a stable id.
 *
 * The consequence is that these hooks work for photos, videos, products,
 * search results or anything else, and the compiler proves they never depend
 * on media-specific fields.
 */

/** Extracts a stable, unique key for an item. */
export type GetItemId<TItem> = (item: TItem, index: number) => string;

/** The default: use `item.id` when the item has one. */
export function defaultGetItemId<TItem>(item: TItem, index: number): string {
  if (item !== null && typeof item === 'object' && 'id' in item) {
    const id = (item as { id: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return String(index);
}

/** Props a consumer may pass into any prop-getter. */
export type PropOverrides = Record<string, unknown>;
