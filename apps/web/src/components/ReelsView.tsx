import { useReelSwiper } from 'media-ui-react';
import type { MediaItem } from 'media-react';

/**
 * Vertical reels feed.
 *
 * The CSS in `styles.css` supplies the half of this that the hook deliberately
 * does not ship:
 *
 *     .reel      { height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory }
 *     .reel-item { height: 100%; scroll-snap-align: start }
 *
 * `reel.isActive(i)` drives autoplay so exactly one video plays at a time.
 * Autoplaying all of them stalls the tab within a few pages.
 */

export interface ReelsViewProps {
  items: readonly MediaItem[];
  onActiveChange: (item: MediaItem, index: number) => void;
}

export function ReelsView({ items, onActiveChange }: ReelsViewProps): JSX.Element {
  const reel = useReelSwiper<MediaItem>({ items, onActiveChange, label: 'Video reels' });

  if (items.length === 0) {
    return <p className="status">No videos in this feed. Switch to Videos and search for something.</p>;
  }

  return (
    <div {...reel.getContainerProps({ className: 'reel' })}>
      {items.map((item, index) => (
        <section {...reel.getItemProps(item, index, { className: 'reel-item' })}>
          <video
            src={item.previewUrl}
            poster={item.thumbnailUrl}
            // `muted` + `playsInline` are not optional: without them mobile
            // browsers refuse to autoplay at all.
            muted
            loop
            playsInline
            autoPlay={reel.isActive(index)}
            preload={Math.abs(index - reel.activeIndex) <= 1 ? 'auto' : 'none'}
            ref={(element) => {
              if (!element) return;
              if (reel.isActive(index)) void element.play().catch(() => undefined);
              else element.pause();
            }}
          />
          <div className="reel-caption">
            <strong>{item.author.name}</strong>
            <span>{item.durationSeconds ? `${item.durationSeconds}s` : ''}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
