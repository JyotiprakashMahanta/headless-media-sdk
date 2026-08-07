# Deploying the three sites

This repo produces **three independent static deployments** from one monorepo.
Each is a separate project on the same Git repository, differing only in build
command and output directory.

| Deployment | Build command | Output dir | Needs an API key? |
|---|---|---|---|
| Demo app | `npm run build:libs && npm run build --workspace apps/web` | `apps/web/dist` | **Yes** — `VITE_PEXELS_API_KEY` |
| SDK docs | `npm run build --workspace docs/sdk` | `docs/sdk/dist` | No |
| Component docs | `npm run build:libs && npm run build --workspace docs/components` | `docs/components/dist` | No |

`npm run build:libs` compiles the five packages to their `dist/` folders. It is
required before anything that imports them, because the app and the component
docs consume the packages through their `exports` maps exactly as an external
consumer would.

## Vercel

Create three projects from the same repo. For each, set **Root Directory** to
the repo root (not the subfolder) and override the build settings:

**Demo app**
- Build command: `npm run build:libs && npm run build --workspace apps/web`
- Output directory: `apps/web/dist`
- Environment variable: `VITE_PEXELS_API_KEY` = your key

**SDK docs**
- Build command: `npm run build --workspace docs/sdk`
- Output directory: `docs/sdk/dist`

**Component docs**
- Build command: `npm run build:libs && npm run build --workspace docs/components`
- Output directory: `docs/components/dist`

Build command and output directory are set **per project in the Vercel
dashboard**, not in `vercel.json`. All three projects share one repo, so a
`buildCommand` in `vercel.json` would apply to all of them and break two. The
committed `vercel.json` therefore contains only a static-hosting rewrite, which
is safe for all three.

## Netlify

Same three sites; in each site's build settings:

```
Base directory:    (leave empty)
Build command:     <from the table above>
Publish directory: <from the table above>
```

## GitHub Pages

Pages serves one site per repo, so publish the demo app and put the two docs
sites elsewhere — or build all three into one folder:

```bash
npm run build
mkdir -p public && cp -r apps/web/dist/* public/
cp -r docs/sdk/dist public/sdk
cp -r docs/components/dist public/components
```

## A note on the API key

Only the demo app needs one, and it is embedded in the client bundle because
Pexels offers no OAuth or token exchange — a browser-only app has no way to keep
it secret. The SDK is built so this is contained: the key is read in exactly one
file (`apps/web/src/main.tsx`) and lives in exactly one module thereafter
(`packages/media-core/src/client/http.ts`).

To remove it from the browser entirely, point `baseUrl` at a proxy that adds the
header server-side:

```tsx
<MediaProvider apiKey="unused" baseUrl="https://my-proxy.example.com/pexels">
```

No other application code changes. That the fix is one prop is the point of
isolating auth in the transport layer.
