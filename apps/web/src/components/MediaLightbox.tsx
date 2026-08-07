import { useLightbox } from 'media-ui-react';
import { useMediaDownload, type MediaItem } from 'media-react';

/**
 * Lightbox markup.
 *
 * This is the one component that touches both libraries at once:
 * `useLightbox` (display behaviour) and `useMediaDownload` (SDK action). They
 * do not know about each other — this file is the seam.
 *
 * Escape, arrow keys, focus trap, focus restore, scroll lock and backdrop
 * dismissal all come from the hook. Everything below is markup and CSS.
 */

export interface MediaLightboxProps {
  items: readonly MediaItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onItemView: (item: MediaItem, index: number) => void;
}

export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onItemView,
}: MediaLightboxProps): JSX.Element | null {
  const lightbox = useLightbox<MediaItem>({ items, index, onIndexChange, onClose, onItemView });
  const { download, pendingId, error } = useMediaDownload();

  const item = lightbox.activeItem;
  if (!lightbox.isOpen || !item) return null;

  return (
    <div {...lightbox.getOverlayProps({ className: 'overlay' })}>
      <div {...lightbox.getContentProps({ className: 'dialog' })}>
        <h2 {...lightbox.getTitleProps({ className: 'sr-only' })}>{item.alt}</h2>

        <div className="dialog-media">
          {item.kind === 'video' ? (
            // `key` forces a fresh element when navigating, otherwise the
            // previous video keeps playing under the new source.
            <video key={item.id} src={item.previewUrl} poster={item.thumbnailUrl} controls autoPlay playsInline />
          ) : (
            <img src={item.previewUrl} alt={item.alt} />
          )}
        </div>

        <div className="dialog-bar">
          <button {...lightbox.getPreviousButtonProps({ className: 'btn' })}>Previous</button>
          <span className="dialog-count">
            {(lightbox.activeIndex ?? 0) + 1} / {items.length}
          </span>
          <button {...lightbox.getNextButtonProps({ className: 'btn' })}>Next</button>

          <a className="btn" href={item.author.profileUrl} target="_blank" rel="noopener noreferrer">
            {item.author.name}
          </a>

          <button
            type="button"
            className="btn"
            disabled={pendingId === item.id}
            onClick={() => void download(item, { surface: 'lightbox' })}
          >
            {pendingId === item.id ? 'Downloading…' : 'Download'}
          </button>

          <button {...lightbox.getCloseButtonProps({ className: 'btn' })}>Close</button>
        </div>

        {error && <p className="dialog-error">{error.message}</p>}
      </div>
    </div>
  );
}
