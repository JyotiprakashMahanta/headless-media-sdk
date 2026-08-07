---
name: media-data-wiring
description: Use when wiring data, auth, or activity events into a React app built on the `media-react` SDK wrapper — searching or paginating Pexels media, setting up MediaProvider, handling loading/error states, subscribing to view/download events, or triggering downloads. Use whenever a file imports from `media-react`. Do NOT use for styling or for the headless components in `media-ui-react` (see the media-ui-components skill).
---

# Wiring data with `media-react`

You are wiring a React app to the media SDK. Read this before writing any file
that imports `media-react`.

## The one rule that outranks everything else

**Only `media-react` may be imported for data. Never `media-core`.**

```ts
import { useMediaSearch } from 'media-react';        // correct
import { createMediaClient } from 'media-core';      // WRONG — app must not import core
```

`media-react` re-exports every type the app needs (`MediaItem`, `MediaPage`,
`MediaError`, `MediaEvent`, …). If you find yourself wanting `media-core` in app
code, the type you want is already re-exported from `media-react`. Adding
`media-core` to an app's `package.json` fails `npm run check:boundaries`.

## Setup

`MediaProvider` goes once, at the root, above anything that uses a hook.

```tsx
import { MediaProvider } from 'media-react';

<MediaProvider apiKey={import.meta.env.VITE_PEXELS_API_KEY} logEvents>
  <App />
</MediaProvider>
```

- `apiKey` is the only required prop. Get one free at <https://www.pexels.com/api/>.
- `logEvents` defaults to `true` and attaches the SDK's console listener. Pass
  `logEvents={false}` in tests to keep output clean.
- **Never** call `configureMedia()` from React code. It exists for CLIs and
  scripts. In React it creates a module singleton that leaks between tests and
  between SSR requests. Use the provider.
- Read the key from `import.meta.env.VITE_PEXELS_API_KEY` at the provider and
  nowhere else. If you are about to reference the env var in a second file, stop
  — pass the value down or use `useMediaClient()` instead.

## Hooks

### `useMediaSearch({ query, kind, perPage, orientation, size, locale, enabled })`

```tsx
const { items, isLoading, isLoadingMore, error, hasMore, loadMore, refresh, totalResults }
  = useMediaSearch({ query: debounced, kind: 'photo', perPage: 24 });
```

- `items` is **already accumulated across pages**. Do not keep your own array
  and concatenate — you will double every item.
- `loadMore` is referentially stable and already no-ops while a page is in
  flight or when `hasMore` is false. Do not add your own guard.
- An empty or whitespace `query` is not an error: the hook returns `items: []`
  and never calls the network. Do not wrap the hook in a conditional, and never
  call a hook conditionally.
- `isLoading` is first-page-only; `isLoadingMore` is appending. Use the first
  for skeletons and the second for a footer spinner. Using `isLoading` for both
  makes the grid blank out on every page.

### `useCuratedMedia({ kind, perPage })`

Identical return shape, used for the empty state before the user searches. Because
the shapes match, you can pick a feed with a ternary and pass the result straight
into one grid — do not write two grids.

```tsx
const search = useMediaSearch({ query, kind, enabled: query.length > 0 });
const curated = useCuratedMedia({ kind, enabled: query.length === 0 });
const feed = query ? search : curated;
```

### `useMediaItem(id, { initialItem })`

For deep links. **Always pass `initialItem` when you already have the item**
(e.g. opening a lightbox from a grid) — it skips the request entirely and
removes the loading flash.

### `useDebouncedValue(value, ms)`

Debounce the search input with this. Pexels rate-limits at 200 requests/hour;
an undebounced input burns that in a minute of typing.

```tsx
const [query, setQuery] = useState('');
const debounced = useDebouncedValue(query, 350);
const { items } = useMediaSearch({ query: debounced });
```

Bind the `<input>` to `query` (instant feedback) and the hook to `debounced`.
Binding the input to the debounced value makes typing feel broken.

## Events

Four event types: `view`, `download`, `search`, `error`.

```tsx
useMediaEvent('download', (event) => {
  analytics.track('media_download', { id: event.item.id, surface: event.surface });
});

const activity = useMediaActivity({ limit: 20 });  // newest-first rolling log
```

- Pass inline arrow functions freely. The hooks store the handler in a ref, so
  one subscription is created per mount regardless of re-renders. Do **not**
  wrap your handler in `useCallback` "for performance" — it changes nothing.
- Do not call `client.on(...)` inside a `useEffect` yourself. That is what these
  hooks are.
- Event payloads never contain the API key. If you need the credential in a
  listener, the design is wrong — reconsider.

## Reporting activity

Views and downloads are reported **by the app**, because only the app knows what
a "surface" is. Always pass one.

```tsx
const client = useMediaClient();
client.trackView(item, { surface: 'grid' });     // or 'lightbox', 'reel'
```

Wire `trackView` to the components' visibility callbacks (`onItemVisible`,
`onActiveChange`, `onItemView`) rather than calling it on render — on render it
fires for items that were never actually seen.

## Downloads

```tsx
const { download, pendingId, error } = useMediaDownload();
<button onClick={() => download(item, { surface: 'lightbox' })} disabled={pendingId === item.id}>
```

Do not build the download yourself. A cross-origin `<a download>` is ignored by
browsers and navigates instead; the hook fetches to a Blob, names the file from
the photographer and id, and falls back to opening the source page. It also
emits the `download` event, which a hand-rolled anchor would not.

## Errors

Every rejection is a `MediaError` with a `code`. Branch on the code, never on
the message:

```tsx
if (error) {
  if (error.code === 'auth')       return <p>Check your Pexels API key.</p>;
  if (error.code === 'rate_limit') return <p>Rate limited. Try again shortly.</p>;
  return <p>{error.message} <button onClick={refresh}>Retry</button></p>;
}
```

Codes: `auth`, `rate_limit`, `not_found`, `invalid_request`, `network`,
`aborted`, `parse`, `unknown`. `error.retryable` is true for `network` and
`rate_limit`. You will never see `aborted` — the hooks swallow it, because an
aborted request means the user typed another character.

## Checklist before you finish

- [ ] Nothing imports `media-core`.
- [ ] `MediaProvider` appears exactly once, at the root.
- [ ] The API key is referenced in exactly one file.
- [ ] Search input is debounced.
- [ ] `isLoading` and `isLoadingMore` drive different UI.
- [ ] Errors branch on `error.code`.
- [ ] `trackView` is called from a visibility callback with a real `surface`.
