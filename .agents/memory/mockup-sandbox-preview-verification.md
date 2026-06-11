---
name: Verifying mockup-sandbox previews
description: How to confirm a canvas mockup actually renders — external_url screenshots DO reach the sandbox; app_preview paths do not.
---

Canvas mockup components live under `/__mockup/preview/<group>/<Component>` and are served by the sandbox's OWN vite dev server (separate port, base `/__mockup/`). The MAIN app on port 5000 proxies `/__mockup/*` through to that sandbox server, so the full external URL renders the real component.

**Two screenshot paths behave differently:**
- `screenshot` `type: external_url` with the full `https://<domain>/__mockup/preview/<group>/<Component>` URL → **renders the actual component.** A blank first capture is usually a transient load-timing artifact, not a real error — re-shoot once at `?v=N` before assuming the component is broken.
- `screenshot` `type: app_preview` with a `path` → builds `http://localhost:5000/<path>` and the main app's SPA catch-all serves the main app (e.g. fan login), NOT the component. Don't use this for sandbox previews.

**Why:** the edge + main app route `/__mockup/*` to the sandbox vite server, but `app_preview` hits the app origin directly and never carries you to the sandbox.

**How to apply:**
- To eyeball a mockup, use `external_url` on the full `https://<domain>/__mockup/preview/<group>/<Component>` URL. Cache-bust with `?v=N`; if the first capture is blank, re-shoot once (load timing) before assuming a real error.
- To verify it merely compiles (no runtime render), curl the sandbox: find the port from the workflow log line `Local: http://localhost:<PORT>/__mockup/` ("artifacts/mockup-sandbox: Component Preview Server", port is dynamic per boot) and `curl -o /dev/null -w "%{http_code}" http://localhost:5000/__mockup/src/components/mockups/<group>/<Component>.tsx` → 200 = Vite transformed it, 500 = syntax/transform error.
