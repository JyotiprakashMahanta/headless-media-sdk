import { useGrid } from 'media-ui-react';
import type { MediaItem } from 'media-react';

/**
 * All markup and CSS live here; `useGrid` supplies only behaviour.
 *
 * Note what this component does NOT contain: no scroll listener, no
 * `hasMore &&` guard around load-more, no IntersectionObserver, no keyboard
 * handling, no de-duplication. Those are the hook's, and re-implementing any of
 * them here would double the work at best and double the requests at worst.
 */

export interface MediaGridProps {
  items: readonly MediaItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (item: MediaItem, index: number) => void;
  onItemVisible: (item: MediaItem, index: number) => void;
}

const COLUMNS = 4; // must match `grid-template-columns` in styles.css

export function MediaGrid({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  onItemVisible,
}: MediaGridProps): JSX.Element {
  const grid = useGrid<MediaItem>({
    items,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onSelect,
    onItemVisible,
    columns: COLUMNS,
    label: 'Media results',
  });

  return (
    <>
      <div {...grid.getGridProps({ className: 'grid' })}>
        {items.map((item, index) => (
          <article
            {...grid.getItemProps(item, index, {
              className: 'cell',
              // aspect-ratio comes from the SDK's normalised item, so the cell
              // reserves the right space before the image loads and the grid
              // does not reflow on every response.
              style: {
                aspectRatio: String(item.aspectRatio),
                backgroundColor: item.placeholderColor ?? '#1a1a1a',
              },
            })}
          >
            <img src={item.thumbnailUrl} alt={item.alt} loading="lazy" decoding="async" />
            {item.kind === 'video' && (
              <span className="badge" aria-hidden="true">
                {item.durationSeconds ? `${item.durationSeconds}s` : 'video'}
              </span>
            )}
            <span className="credit">{item.author.name}</span>
          </article>
        ))}
      </div>

      {/* Must have non-zero height and sit in the scroll container, or the
          IntersectionObserver never fires and load-more silently dies. */}
      <div {...grid.getSentinelProps({ className: 'sentinel' })} />

      {isLoadingMore && <p className="status">Loading more…</p>}
      {!hasMore && items.length > 0 && <p className="status">End of results.</p>}

      <span {...grid.getStatusProps({ className: 'sr-only' })} />
    </>
  );
}
