---
name: media-ui-components
description: Use when building UI with the headless `media-ui-react` primitives — a media grid with infinite scroll, a lightbox/modal viewer, or a vertical reels swiper. Covers prop-getters, the required CSS contract, and accessibility. Use whenever a file imports from `media-ui-react`. Do NOT use for fetching, auth, or SDK events (see the media-data-wiring skill).
---

# Building UI with `media-ui-react`

These are **headless** hooks. They return behaviour and accessibility, never
markup and never styles. You write every element and every line of CSS.

## The one rule that outranks everything else

**`media-ui-react` knows nothing about the SDK, and must stay that way.**

The hooks are generic over the item type. They never import `media-core` or
`media-react`, and neither should any file you add to that package. Data flows
in as props; actions flow out as callbacks. In the app, the component library
and the SDK meet in exactly one place — the page component — and nowhere else.

## Prop-getters: how to call them

Every getter accepts your own props and merges them. Always pass your props
*into* the getter; never spread them alongside it.

```tsx
// correct — merged: both onClick handlers run, both classNames land
<article {...getItemProps(item, i, { className: 'card', onClick: myHandler })} />

// WRONG — className and onClick silently overwrite the hook's
<article {...getItemProps(item, i)} className="card" onClick={myHandler} />
```

Merge rules: event handlers compose with **yours first**; `className` is
concatenated; `style` is shallow-merged with yours winning; `ref` is composed so
you can keep your own. Calling `event.preventDefault()` in your handler skips
the hook's built-in behaviour — that is the supported way to opt out.

## Grid

```tsx
const grid = useGrid({
  items, hasMore, isLoadingMore, onLoadMore: loadMore,
  onSelect: (item, i) => setLightboxIndex(i),
  onItemVisible: (item) => client.trackView(item, { surface: 'grid' }),
  columns: 4,
});

<div {...grid.getGridProps({ className: 'grid' })}>
  {items.map((item, i) => (
    <article {...grid.getItemProps(item, i, { className: 'cell' })}>
      <img src={item.thumbnailUrl} alt={item.alt} loading="lazy" />
    </article>
  ))}
  <div {...grid.getSentinelProps({ className: 'sentinel' })} />
</div>
<span {...grid.getStatusProps({ className: 'sr-only' })} />
```

**CSS contract — the grid does not work without these:**

- `.sentinel` must have non-zero height (`height: 1px` is enough) and must be
  inside the scrolling container. A zero-height sentinel never intersects, and
  infinite scroll silently never fires. This is the single most common bug.
- `.cell` needs `outline` on `:focus-visible`. The hook manages a roving
  tabindex; if you remove the outline the grid becomes unusable by keyboard.
- Reserve space before images load with `aspect-ratio: var(--ratio)` fed from
  `item.aspectRatio`, or the whole grid reflows on every image.

Pass `columns` matching your CSS column count — it is used only for Up/Down
arrow arithmetic. A wrong value does not break layout, it breaks keyboard nav.

Do not add your own scroll listener, `onMouseEnter` view tracking, or
`hasMore &&` guard around `loadMore`. All three are already handled and doubling
them causes duplicate requests.

## Lightbox

Controlled: **you** own the open index, so deep links and the back button work.

```tsx
const [index, setIndex] = useState<number | null>(null);

const lb = useLightbox({
  items, index, onIndexChange: setIndex, onClose: () => setIndex(null),
  onItemView: (item) => client.trackView(item, { surface: 'lightbox' }),
});

{lb.isOpen && (
  <div {...lb.getOverlayProps({ className: 'overlay' })}>
    <div {...lb.getContentProps({ className: 'dialog' })}>
      <h2 {...lb.getTitleProps({ className: 'sr-only' })}>{lb.activeItem?.alt}</h2>
      <button {...lb.getPreviousButtonProps({ children: '‹' })} />
      <img src={lb.activeItem.previewUrl} alt={lb.activeItem.alt} />
      <button {...lb.getNextButtonProps({ children: '›' })} />
      <button {...lb.getCloseButtonProps({ children: '×' })} />
    </div>
  </div>
)}
```

Requirements:

- `getContentProps` **must** be spread on the element that wraps the focusable
  content. It carries the ref used for the focus trap. Put it on the wrong
  element and Tab escapes to the page behind the overlay.
- `getTitleProps` must be spread on an element with text. It is referenced by
  `aria-labelledby`; without it the dialog is announced as unlabelled.
- Render the overlay conditionally on `lb.isOpen`. Do not hide it with CSS —
  a `display: none` dialog still holds focus.
- Escape, Left/Right, Home/End, backdrop click, focus trap, focus restore and
  body scroll lock are all handled. Do not add `onKeyDown` listeners for them.

## Reel swiper

```tsx
const reel = useReelSwiper({
  items: videos,
  onActiveChange: (item) => client.trackView(item, { surface: 'reel' }),
});

<div {...reel.getContainerProps({ className: 'reel' })}>
  {videos.map((item, i) => (
    <section {...reel.getItemProps(item, i, { className: 'reel-item' })}>
      <video src={item.previewUrl} muted loop playsInline
             autoPlay={reel.isActive(i)} />
    </section>
  ))}
</div>
```

**CSS contract — the snap behaviour is entirely yours to provide:**

```css
.reel      { height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory; }
.reel-item { height: 100%; scroll-snap-align: start; }
```

Without `scroll-snap-type` the reel is just a scrolling list, and active-item
detection will report whatever happens to be centred. The hook adds
`[data-reel-container]` and `[data-reel-item]` if you prefer attribute selectors.

Use `reel.isActive(i)` to play exactly one video at a time. Autoplaying all of
them will stall the tab. Videos must be `muted` and `playsInline` or mobile
browsers refuse to autoplay at all.

## Accessibility you still owe

The hooks provide roles, `aria-modal`, `aria-live`, labels and focus management.
You still have to:

- give every `<img>` a real `alt` (use `item.alt`)
- keep a visible `:focus-visible` style
- ship an `.sr-only` class for `getStatusProps` and the dialog title:
  `position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)`
- respect `prefers-reduced-motion` on any transition you add

## Checklist before you finish

- [ ] Nothing in `media-ui-react` imports `media-core` or `media-react`.
- [ ] Your props go *inside* the getters, not next to them.
- [ ] The grid sentinel has non-zero height and sits in the scroll container.
- [ ] `getContentProps` is on the dialog wrapper; `getTitleProps` on real text.
- [ ] The reel container has `scroll-snap-type: y mandatory`.
- [ ] Only the active reel video plays.
- [ ] `:focus-visible` is styled, and `.sr-only` exists.
