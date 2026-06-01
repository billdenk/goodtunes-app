---
name: Mockup-sandbox canvas iframes can't load main-app asset paths
description: Why album art / logos go blank in canvas mockup iframes and how to make assets resolve
---

Mockup components rendered as **canvas iframes** must reference assets that live
inside the mockup sandbox itself (`artifacts/mockup-sandbox/public/images/...`,
referenced as `/__mockup/images/...`). They must NOT reference main-app paths like
`/figmaAssets/...` or `/objects/uploads/...`.

**Why:** the canvas iframe renders the component from the mockup dev server's
`/__mockup/preview/...` route. A bare absolute path like `/figmaAssets/x.png` from
inside that page does not reach the main Express app, so the `<img>` resolves to
nothing and the art/logo area is blank (component otherwise renders fine — text +
chips show, only images miss). Port 5904 only serves pre-built static image shapes
(e.g. `gooddeed-og.png`); it 404s `/__mockup/preview/...` and `/__mockup/images/...`.

**How to apply:** to preview a real catalog asset in a mockup, copy the file into
`artifacts/mockup-sandbox/public/images/` and point the component's `ART`/`LOGO`
const at `/__mockup/images/<file>`. This is preview-only; the real renderer
(`server/certOgImage.ts`) runs on the main app where `/figmaAssets` works directly.

**Gotcha:** the `screenshot` external_url tool caches by URL — after changing an
asset, append a cache-buster (`?v=2`) or you'll keep seeing the stale capture.

## Canvas iframe shapes need an explicit live URL or they skeleton forever
A canvas `iframe` shape created with only `componentPath`/`componentName` (no
`url`, no `state`) renders the canvas's **"building" skeleton placeholder**
indefinitely — gray rounded bars/panels, NOT the component, NOT a red error. The
direct `/__mockup/preview/...` URL renders fine the whole time, so it looks like a
phantom bug. Fix: the shape needs `url` = `https://<domain>/__mockup/preview/
{folder}/{Component}` (no `.tsx`) AND `state: "live"`.

**How to apply:** when creating mockup iframes, set `state: "building"` first for
instant feedback, then once the component renders set `url` + `state: "live"`.
Update actions must also include `shapeType: "iframe"` in the `updates` payload or
the call is rejected. `process.env` is NOT available in the code_execution sandbox
— hardcode the domain (or read it elsewhere) when building the URL.

## Screenshot captures go blank/partial during HMR
After rapid edits to a mockup component, the external-URL screenshot tool often captures a blank or half-rendered sheet — it fires mid Vite HMR reload (browser console shows `[vite] connecting...` → `connected` straddling the capture), NOT a real render bug. Don't chase a phantom crash: `restart_workflow("artifacts/mockup-sandbox: Component Preview Server")` for a clean build, then capture with a fresh `?v=N` cache-buster.

## Verifying multi-state interactive mockups
Give the interactive component a tiny URL-param init (read `window.location.search` in the useState initializers, e.g. `?persona=returning&screen=confirm&pending=tidal`) so each state can be screenshotted directly. Harmless preview-only code; defaults cleanly to the first state with no params so the on-canvas interactive experience is unchanged.
