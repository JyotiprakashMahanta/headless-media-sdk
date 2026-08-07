import { useCallback, useEffect, useState } from 'react';
import { useGrid, useLightbox, useReelSwiper } from 'media-ui-react';
import { fetchDemoPage, makeItems, MAX_DEMO_PAGES, type DemoItem } from './fixtures.js';

/**
 * Live documentation for `media-ui-react`.
 *
 * The only import from our packages is `media-ui-react`. No SDK, no API key,
 * no network. Every demo below runs on the plain objects in `fixtures.ts`.
 */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function GridDemo({ onOpen }: { onOpen: (items: DemoItem[], index: number) => void }) {
  const [items, setItems] = useState<DemoItem[]>(() => makeItems(12));
  const [page, setPage] = useState(1);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [seen, setSeen] = useState(0);

  const hasMore = page < MAX_DEMO_PAGES;

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    const nextPage = page + 1;
    void fetchDemoPage(nextPage).then((next) => {
      setItems((current) => [...current, ...next]);
      setPage(nextPage);
      setLoadingMore(false);
    });
  }, [page]);

  const grid = useGrid<DemoItem>({
    items,
    hasMore,
    isLoadingMore,
    onLoadMore: loadMore,
    onSelect: (_item, index) => onOpen(items, index),
    onItemVisible: () => setSeen((count) => count + 1),
    columns: 4,
  });

  return (
    <>
      <p className="demo-meta">
        {items.length} items · page {page}/{MAX_DEMO_PAGES} · {seen} first-views reported
      </p>
      <div className="scroller">
        <div {...grid.getGridProps({ className: 'grid' })}>
          {items.map((item, index) => (
            <button
              {...grid.getItemProps(item, index, {
                className: 'cell',
                style: { background: item.color, aspectRatio: String(item.ratio) },
              })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div {...grid.getSentinelProps({ className: 'sentinel' })} />
        {isLoadingMore && <p className="demo-meta">Loading more…</p>}
        {!hasMore && <p className="demo-meta">End of demo data.</p>}
      </div>
      <span {...grid.getStatusProps({ className: 'sr-only' })} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function LightboxDemo({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: DemoItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const lightbox = useLightbox<DemoItem>({ items, index, onIndexChange, onClose });
  const item = lightbox.activeItem;
  if (!lightbox.isOpen || !item) return null;

  return (
    <div {...lightbox.getOverlayProps({ className: 'overlay' })}>
      <div {...lightbox.getContentProps({ className: 'dialog' })}>
        <h3 {...lightbox.getTitleProps({ className: 'sr-only' })}>{item.label}</h3>
        <div className="dialog-media" style={{ background: item.color, aspectRatio: String(item.ratio) }}>
          {item.label}
        </div>
        <div className="dialog-bar">
          <button {...lightbox.getPreviousButtonProps({ className: 'btn' })}>‹ Prev</button>
          <span>
            {(lightbox.activeIndex ?? 0) + 1} / {items.length}
          </span>
          <button {...lightbox.getNextButtonProps({ className: 'btn' })}>Next ›</button>
          <button {...lightbox.getCloseButtonProps({ className: 'btn' })}>Close</button>
        </div>
        <p className="dialog-hint">Try Escape, ← → , Home/End, Tab (focus is trapped), and clicking the backdrop.</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReelDemo() {
  const [items] = useState(() => makeItems(8, 20));
  const [log, setLog] = useState<string[]>([]);

  const reel = useReelSwiper<DemoItem>({
    items,
    onActiveChange: (item, index) => setLog((entries) => [`${index}: ${item.label}`, ...entries].slice(0, 4)),
  });

  return (
    <div className="reel-demo">
      <div {...reel.getContainerProps({ className: 'reel' })}>
        {items.map((item, index) => (
          <div
            {...reel.getItemProps(item, index, {
              className: 'reel-item',
              style: { background: item.color },
            })}
          >
            <span>{item.label}</span>
            {reel.isActive(index) && <em>active</em>}
          </div>
        ))}
      </div>
      <div className="reel-side">
        <p className="demo-meta">
          Active index: <strong>{reel.activeIndex}</strong>
        </p>
        <div className="btn-row">
          <button className="btn" onClick={reel.previous}>
            ↑ Previous
          </button>
          <button className="btn" onClick={reel.next}>
            ↓ Next
          </button>
        </div>
        <ul className="log">
          {log.map((entry, i) => (
            <li key={`${entry}-${i}`}>{entry}</li>
          ))}
        </ul>
        <p className="demo-meta">Scroll the panel, or focus it and use arrow keys.</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function App(): JSX.Element {
  const [lightboxItems, setLightboxItems] = useState<DemoItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Demonstrates that opening from anywhere works — the hook is controlled.
  useEffect(() => {
    if (lightboxIndex === null) setLightboxItems((current) => current);
  }, [lightboxIndex]);

  return (
    <div className="page">
      <header>
        <h1>media-ui-react</h1>
        <p className="lede">Headless UI primitives — behaviour and accessibility, never styles.</p>
        <nav>
          <a href="#contract">The contract</a>
          <a href="#getters">Prop-getters</a>
          <a href="#grid">Grid</a>
          <a href="#lightbox">Lightbox</a>
          <a href="#reel">Reel Swiper</a>
        </nav>
        <div className="callout">
          <strong>This page imports <code>media-ui-react</code> and nothing else of ours.</strong> No SDK, no API
          key, no network — every demo below runs on plain objects defined in <code>fixtures.ts</code>. That this
          page can exist at all is the proof that the components are independent of the SDK.
        </div>
      </header>

      <main>
        <Section id="contract" title="The contract">
          <ul>
            <li><strong>No imports of ours.</strong> Not <code>media-core</code>, not <code>media-react</code>. React is the only peer dependency.</li>
            <li><strong>No styles.</strong> Not a stylesheet, not a utility class, not an inline style. You write all markup and CSS.</li>
            <li><strong>Generic over the item type.</strong> Hooks take <code>readonly TItem[]</code> plus a way to get an id. They do not know what a "photo" is.</li>
          </ul>
          <p>What they <em>do</em> ship is the part that is actually hard: focus trapping and restoration, roving tabindex, IntersectionObserver-driven infinite scroll and active-item detection, and prop merging that lets you override any of it without forking.</p>
        </Section>

        <Section id="getters" title="Prop-getters">
          <p>Pass your props <em>into</em> the getter. Never spread them alongside it.</p>
          <pre><code>{`// correct — both handlers run, both classNames land
<article {...getItemProps(item, i, { className: 'card', onClick: track })} />

// WRONG — yours silently overwrite the hook's
<article {...getItemProps(item, i)} className="card" onClick={track} />`}</code></pre>
          <table>
            <thead><tr><th>Prop</th><th>Merge rule</th></tr></thead>
            <tbody>
              <tr><td>Event handlers</td><td>Both run, <strong>yours first</strong>. Call <code>preventDefault()</code> to skip the hook's.</td></tr>
              <tr><td><code>className</code></td><td>Concatenated.</td></tr>
              <tr><td><code>style</code></td><td>Shallow-merged, yours wins.</td></tr>
              <tr><td><code>ref</code></td><td>Composed — you keep yours, the hook keeps its.</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="grid" title="Grid">
          <p><code>useGrid({'{ items, hasMore, isLoadingMore, onLoadMore, onSelect, onItemVisible, columns }'})</code></p>
          <p>Returns <code>getGridProps</code>, <code>getItemProps</code>, <code>getSentinelProps</code>, <code>getStatusProps</code>, <code>activeIndex</code>, <code>setActiveIndex</code>, <code>isEmpty</code>.</p>
          <div className="callout warn">
            <strong>CSS contract.</strong> The sentinel must have non-zero height and sit inside the scroll container.
            A zero-height sentinel never intersects, and infinite scroll silently never fires. This is the most common
            integration bug. Also style <code>:focus-visible</code> — the hook manages a roving tabindex, so removing
            the outline makes the grid unusable by keyboard.
          </div>
          <div className="demo">
            <GridDemo
              onOpen={(items, index) => {
                setLightboxItems(items);
                setLightboxIndex(index);
              }}
            />
          </div>
          <p className="demo-meta">Click a cell to open the lightbox. Tab into the grid and use arrows / Home / End / Enter.</p>
        </Section>

        <Section id="lightbox" title="Lightbox">
          <p><code>useLightbox({'{ items, index, onIndexChange, onClose, onItemView, loop }'})</code> — controlled, so deep links and the back button stay possible.</p>
          <div className="callout warn">
            <strong>Two hard requirements.</strong> <code>getContentProps</code> must be spread on the element wrapping
            the focusable content (it carries the focus-trap ref), and <code>getTitleProps</code> must be on an element
            with real text (it is referenced by <code>aria-labelledby</code>). Render conditionally on <code>isOpen</code> —
            a <code>display: none</code> dialog still holds focus.
          </div>
          <p>Handled for you: Escape, ← →, Home/End, focus trap, focus restore, body scroll lock, and backdrop
          dismissal that correctly ignores drags started inside the dialog.</p>
        </Section>

        <Section id="reel" title="Reel Swiper">
          <p><code>useReelSwiper({'{ items, onActiveChange, threshold, onReachEnd, initialIndex }'})</code></p>
          <div className="callout warn">
            <strong>CSS contract.</strong> The snap behaviour is entirely yours:
            <pre><code>{`.reel      { height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory }
.reel-item { height: 100%; scroll-snap-align: start }`}</code></pre>
            Without <code>scroll-snap-type</code> it is just a scrolling list and active detection reports whatever
            happens to be centred.
          </div>
          <p>Active detection uses IntersectionObserver against the scroll container at <code>threshold: 0.6</code>, not
          scroll maths. Scroll position breaks with variable heights and fires on every frame of an iOS momentum
          scroll; the browser computes intersection off the main thread and only reports a settle.</p>
          <div className="demo">
            <ReelDemo />
          </div>
        </Section>
      </main>

      <LightboxDemo
        items={lightboxItems}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <footer>
        <p>Built for the FotoOwl take-home. SDK documentation is a separate deployment.</p>
      </footer>
    </div>
  );
}
