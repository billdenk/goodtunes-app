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
