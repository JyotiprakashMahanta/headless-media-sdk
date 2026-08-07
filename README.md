# Headless Media SDK + Component Library

Take-home for the React Developer role at FotoOwl Software Solutions.

A framework-agnostic media SDK, thin per-platform wrappers, independent
headless UI libraries, one app that wires them together, and two agent skills
that teach an AI coding tool to consume them correctly.

Data source: [Pexels](https://www.pexels.com/api/) (photos + videos).

---

## Links

| | |
|---|---|
| Demo app | _<add deployed URL>_ |
| SDK docs | _<add deployed URL>_ |
| Component docs | _<add deployed URL>_ |
| Repo | _<add GitHub URL>_ |
| AI chat transcripts | _<add link(s)>_ |

---

## Run it

```bash
npm install
cp .env.example .env          # add your free Pexels key
npm run build:libs            # compile the five packages
npm run dev                   # demo app on :5173

npm run dev:docs:sdk          # SDK docs on :5174
npm run dev:docs:components   # component docs on :5175  (no API key needed)

npm test                      # 24 tests, fully offline
npm run check:boundaries      # architecture guard
npm run verify                # boundaries + build + tests
```

Deployment for all three sites: see [DEPLOY.md](./DEPLOY.md).

---

## Architecture

```
apps/web ─────────▶ media-react   ────────▶ media-core
                    media-native  ────────▶ media-core
apps/web ─────────▶ media-ui-react          (imports nothing of ours)
                    media-ui-native         (imports nothing of ours)
```

| Package | Depends on | Contains |
|---|---|---|
| `media-core` | **nothing** | Pexels client, auth, typed domain model, errors, cache + de-dupe, event emitter |
| `media-react` | `media-core`, React | Provider + hooks. No business logic |
| `media-native` | `media-core`, React, RN | Same contract, native idioms |
| `media-ui-react` | React only | Headless Grid / Lightbox / Reel Swiper |
| `media-ui-native` | React + RN only | The same three, `FlatList`/`Modal` idioms |
| `apps/web` | `media-react` + `media-ui-react` | The only wiring layer |
| `docs/components` | `media-ui-react` only | Live component docs — no SDK, no API key |

### The boundaries are enforced, not promised

`npm run check:boundaries` fails the build on any violation. It checks three
things per package:

1. declared `dependencies` / `peerDependencies`
2. every actual `import` / `require` / `import()` specifier in `src`
3. platform globals (`document`, `window`, `localStorage`, `navigator`) inside
   `media-core`

The compiler is the second line of defence: `media-core` builds with
`"lib": ["ES2022"], "types": []` — no DOM, no Node, no React. A stray
`document.` there does not compile. `media-native` and `media-ui-native` also
build without DOM.

`packages/media-core/src/env.d.ts` is worth a look: it declares the *complete*
ambient surface core assumes from its host, and it is four lines long. That file
is the portability claim, in a form you can check.

---

## Design decisions

**A domain model, not provider shapes.** Raw Pexels JSON exists only inside
`src/client/pexels.ts`. Everything above consumes `MediaItem` / `MediaPage`.
Swapping to Unsplash means writing a sibling of that one file — no hook,
component or app code changes. Photos and videos share one shape, so the grid
never branches on kind.

**Auth lives in one closure.** The key is captured by `createHttpClient` and is
never stored on an instance, returned, put in a cache key, an event payload, an
error message or the `endpoint` field. Three tests assert exactly this. Pexels
has no OAuth, so a browser app must ship the key — the design confines the
blast radius and makes "point `baseUrl` at a proxy and drop the key" a one-prop
change.

**Cache and de-dupe are one mechanism.** They share a key, so they share a
`Map`. Three components asking for the same page in the same tick produce one
request; React 18 StrictMode alone doubles every request in dev without this.
No `localStorage` — core must run in a worker or a CLI, and persistence is the
embedder's policy decision.

**Errors are a taxonomy.** Every rejection is a `MediaError` with a `code`, so
the app branches on meaning rather than string-matching messages. The demo shows
different copy and different affordances for `auth` vs `rate_limit`.

**`on()` returns an unsubscribe.** No "pass the same reference to `off()`"
footgun, and it drops straight into a `useEffect` cleanup. Listeners are copied
before dispatch so unsubscribing mid-dispatch is safe, and a throwing listener
never breaks the SDK.

**Download is split across the boundary.** Core resolves *which URL and what
filename* and emits the event; the wrapper turns that into bytes on disk —
Blob + anchor on web, share sheet on native. Core cannot do the second half (no
DOM) and the wrapper must not do the first (provider knowledge). Neither half
moves without breaking the other platform. This is the clearest example of what
"wrappers adapt, they do not decide" means here.

**The hooks are genuinely headless.** No component is exported — only hooks
returning prop-getters. `mergeProps` makes that real: your handlers run first
and can `preventDefault()` to skip the built-in behaviour, `className` is
concatenated, `style` shallow-merged, `ref` composed. Without that, a
"prop-getter" is just a props object you have to fight.

They are also generic over the item type. Copying `MediaItem` into
`media-ui-react` would have coupled the packages by copy-paste instead of by
import — the same problem, harder to notice. Instead the hooks take
`readonly TItem[]` and a `getItemId`, which is why the component docs site can
render them with plain fixture objects and no API key at all.

**Search hooks and curated hooks return the same shape**, so the app picks a
feed with a ternary and passes it to one grid.

**Stale responses are dropped by a monotonic token, not just aborts.** An
already-resolved promise can still land after the input changed; aborting alone
does not cover that.

---

## The two skills

Both live in [`skills/`](./skills) in Claude Code / Cursor `SKILL.md` format
(YAML frontmatter + body).

| Skill | Scope |
|---|---|
| [`media-data-wiring`](./skills/media-data-wiring/SKILL.md) | Provider setup, auth, hooks, loading/error states, events, downloads |
| [`media-ui-components`](./skills/media-ui-components/SKILL.md) | Prop-getters, the CSS contract, accessibility |

They are split along the boundary the architecture cares about: one covers
"getting data", one covers "showing it", and each explicitly tells the agent to
use the other for the opposite concern. Each ends with a checklist that maps to
a real failure mode.

### How they were used and tested

The skills were written **before** the app, and the app was then built with them
loaded. That ordering is deliberate: a skill written after the fact just
describes what you already did.

The concrete corrections they produced, in order of how much time each saved:

1. **`media-core` in app code.** The default instinct is to reach for the client
   directly. The skill's first rule stops it, and points out that every needed
   type is re-exported from `media-react`.
2. **A zero-height sentinel.** Generated markup put the infinite-scroll sentinel
   in as an empty `<div>` with no CSS. It never intersects, so load-more
   silently never fires — and nothing errors, which makes it expensive to
   debug. The skill calls this out as the most common bug; `styles.css` now
   carries `.sentinel { height: 1px }` with a comment saying why.
3. **Props spread beside a getter instead of into it.**
   `{...getItemProps(item, i)} className="cell"` looks right and silently drops
   the hook's own className and handlers.
4. **`isLoading` used for both first load and pagination**, which blanks the
   grid on every page.
5. **A hand-rolled `<a download>`.** Cross-origin, browsers ignore the attribute
   and navigate instead — and it skips the `download` event entirely.
6. **All reel videos autoplaying.** The skill's "use `isActive(i)`" line, plus
   the `muted` + `playsInline` requirement without which mobile refuses to
   autoplay at all.

A quick way to see the difference: open `docs/components` and ask an agent to
build a grid with infinite scroll, once with the skill loaded and once without.
Without it, the sentinel and the `getItemProps` spread go wrong most times.

---

## AI assistance

AI tools were used throughout, as the brief encourages. Being specific about
which parts, since that is explicitly asked for:

**Predominantly AI-generated, then reviewed and corrected by hand**

- Boilerplate: `package.json` files, tsconfigs, the Vite configs
- The Pexels raw response interfaces in `client/pexels.ts` (transcribed from
  the API docs)
- First drafts of `useGrid`, `useLightbox`, `useReelSwiper`
- The CSS in the app and both docs sites
- The prose in the two docs sites

**Hand-designed, with AI writing to the design**

- The package split, the dependency rules, and `scripts/check-boundaries.mjs`
- The domain model (`MediaItem` / `MediaPage`) and the decision to normalise
  photos and videos into one shape
- Auth confinement to the transport closure, and the structural `FetchLike`
  type instead of `lib.dom`
- The error taxonomy and which codes are `retryable`
- Cache-plus-de-dupe as one mechanism, and the choice to keep the API key out
  of cache keys
- The event map and the `on() -> unsubscribe` signature
- The download split across the core/wrapper boundary
- Hook naming and return shapes, and making search and curated identical
- `mergeProps` semantics (handler order, `preventDefault` as the opt-out)
- Both `SKILL.md` documents

**Corrections made to AI output during the build** — the ones worth naming,
because they are the failure modes to watch for:

- A first draft reached for `globalThis.fetch` directly in core; injecting it
  through config is what makes the offline test suite and a CLI possible.
- Generated `usePagedMedia` aborted stale requests but did not guard against a
  late-resolving promise. Added the request token.
- Generated `useLightbox` trapped focus but never restored it, and reset
  `body.overflow` to `''` instead of its previous value.
- The reel swiper was first written with `scrollTop / itemHeight` maths. Replaced
  with IntersectionObserver — the maths breaks on variable heights and burns the
  main thread during momentum scroll.
- An early `MediaEventEmitter` iterated the live listener `Set` during dispatch,
  so a listener unsubscribing itself skipped the next listener.

---

## What I cut, and why

The brief asks for judgment under time pressure, so here is the ledger.

**React Native is typechecked but not installed.** `media-native` and
`media-ui-native` are real, complete implementations with `react-native` as an
*optional* peer dependency. What is missing is a runnable RN app. Installing the
RN toolchain buys a reviewer nothing they can open, so instead
`types/react-native.d.ts` declares exactly the RN surface the two packages use —
they still typecheck, and still break the build if they drift. Given more time
this becomes an Expo app; the wrappers are ready for it.

**`usePagedMedia` is duplicated between the two wrappers.** It is
platform-neutral React, so in a real product it would live in a shared
`media-hooks` package between core and both wrappers. The brief's package list
does not include one, and inventing a sixth package to save 120 lines seemed
worse than duplicating them. Both copies carry a comment saying so.

**Tests cover `media-core` only** — 24 of them, offline, run through the built
`exports` map. Core is where the logic that can be wrong without being visible
lives (cache keys, de-dupe, error mapping, key containment). The hooks would
need React Testing Library and jsdom; that was the right thing to drop, not
first.

**Video in the lightbox is basic** — a `<video controls>` with a `key` so
navigating does not leave the previous one playing. No custom scrubber, no HLS.

**No virtualisation in the web grid.** Fine to a few hundred items, which is
where the demo lives. `media-ui-native` gets it free via `FlatList`.

**Visual polish.** Explicitly not scored, and it shows. Layout, focus states and
the accessibility contract are deliberate; nothing else is.

---

## Repository layout

```
packages/
  media-core/        pure TS SDK      · no React, no DOM, no deps
    src/client/      http.ts (auth lives here) · pexels.ts (only file that knows Pexels)
    src/events/      typed emitter + console listener
    src/cache/       TTL cache + in-flight de-dupe
    test/            24 offline tests
  media-react/       provider + hooks
  media-native/      same contract, RN idioms
  media-ui-react/    headless Grid / Lightbox / ReelSwiper + mergeProps
  media-ui-native/   the same three, FlatList/Modal idioms
apps/web/            the demo app — the only package importing both sides
docs/sdk/            deployable SDK docs (static)
docs/components/     deployable component docs with live demos, no API key
skills/              the two SKILL.md documents
scripts/             check-boundaries.mjs
types/               react-native typecheck shim
```
