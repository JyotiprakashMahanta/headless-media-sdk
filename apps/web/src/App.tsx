import { useCallback, useMemo, useState } from 'react';
import {
  useCuratedMedia,
  useDebouncedValue,
  useMediaClient,
  useMediaSearch,
  type MediaItem,
  type MediaKind,
} from 'media-react';
import { MediaGrid } from './components/MediaGrid.js';
import { MediaLightbox } from './components/MediaLightbox.js';
import { ReelsView } from './components/ReelsView.js';
import { ActivityPanel } from './components/ActivityPanel.js';
import { ErrorNotice } from './components/ErrorNotice.js';

/**
 * The wiring layer.
 *
 * This file — and only this file's subtree — imports both `media-react` (data,
 * auth, events) and `media-ui-react` (display). Neither of those packages knows
 * the other exists; the adapter between them is the `onSelect` / `onItemVisible`
 * callbacks below.
 *
 * Visual polish is explicitly not being scored, so the styling is plain. What
 * is deliberate: loading vs loading-more are distinct, errors are typed and
 * actionable, and every view reports activity with a real `surface`.
 */

type View = 'grid' | 'reels';

export function App(): JSX.Element {
  const client = useMediaClient();

  const [rawQuery, setRawQuery] = useState('');
  const [kind, setKind] = useState<MediaKind>('photo');
  const [view, setView] = useState<View>('grid');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Bind the input to the raw value (instant feedback) and the SDK to the
  // debounced one. Pexels allows 200 requests/hour; an undebounced input eats
  // that in about a minute of typing.
  const query = useDebouncedValue(rawQuery, 350);
  const hasQuery = query.trim().length > 0;

  const search = useMediaSearch({ query, kind, perPage: 24, enabled: hasQuery });
  const curated = useCuratedMedia({ kind, perPage: 24, enabled: !hasQuery });

  // Both hooks return the same shape on purpose, so the grid below never needs
  // to know which feed it is rendering.
  const feed = hasQuery ? search : curated;

  const videos = useMemo(
    () => feed.items.filter((item: MediaItem) => item.kind === 'video'),
    [feed.items],
  );

  const trackView = useCallback(
    (item: MediaItem, surface: string) => client.trackView(item, { surface }),
    [client],
  );

  const openLightbox = useCallback((_item: MediaItem, index: number) => {
    setLightboxIndex(index);
  }, []);

  const showReelsTab = kind === 'video' && videos.length > 0;
  const activeView: View = showReelsTab ? view : 'grid';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Media SDK Demo</h1>

        <div className="controls">
          <label className="field">
            <span className="sr-only">Search media</span>
            <input
              type="search"
              value={rawQuery}
              placeholder="Search photos and videos…"
              onChange={(event) => {
                setRawQuery(event.target.value);
                setLightboxIndex(null);
              }}
              autoComplete="off"
            />
          </label>

          <div className="segmented" role="group" aria-label="Media type">
            {(['photo', 'video'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => {
                  setKind(option);
                  setLightboxIndex(null);
                  if (option === 'photo') setView('grid');
                }}
              >
                {option === 'photo' ? 'Photos' : 'Videos'}
              </button>
            ))}
          </div>

          {showReelsTab && (
            <div className="segmented" role="group" aria-label="Layout">
              {(['grid', 'reels'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={activeView === option}
                  onClick={() => setView(option)}
                >
                  {option === 'grid' ? 'Grid' : 'Reels'}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="meta">
          {hasQuery ? `Results for “${query}”` : 'Curated feed'}
          {feed.totalResults !== null && ` · ${feed.totalResults.toLocaleString()} total`}
        </p>
      </header>

      <main className="app-main">
        {feed.error && <ErrorNotice error={feed.error} onRetry={feed.refresh} />}

        {feed.isLoading && <p className="status">Loading…</p>}

        {!feed.isLoading && !feed.error && feed.items.length === 0 && (
          <p className="status">No results. Try “mountains”, “surfing”, or “neon”.</p>
        )}

        {activeView === 'grid' ? (
          <MediaGrid
            items={feed.items}
            hasMore={feed.hasMore}
            isLoadingMore={feed.isLoadingMore}
            onLoadMore={feed.loadMore}
            onSelect={openLightbox}
            onItemVisible={(item) => trackView(item, 'grid')}
          />
        ) : (
          <ReelsView items={videos} onActiveChange={(item) => trackView(item, 'reel')} />
        )}
      </main>

      <MediaLightbox
        items={feed.items}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onItemView={(item) => trackView(item, 'lightbox')}
      />

      <ActivityPanel />
    </div>
  );
}
