---
name: Verifying mockup-sandbox previews
description: How to confirm a canvas mockup actually renders — the screenshot tool can't reach the sandbox.
---

The `screenshot` tool (`type: app_preview`) only ever loads the MAIN app on port 5000. A mockup-sandbox preview lives under `/__mockup/preview/<group>/<Component>` and is served by the sandbox's OWN vite dev server on a separate port, reached externally via path-based edge routing that the screenshot tool bypasses — so screenshotting a `/__mockup/preview/...` path returns the main app (e.g. the fan login page), NOT the component.

**Why:** app_preview builds `http://localhost:5000/<path>` directly, and the main app's SPA catch-all renders for the unknown `/__mockup/...` path. The canvas iframe works because it loads the full external `https://<domain>/__mockup/preview/...` URL, which the edge routes to the sandbox port.

**How to apply:** To verify a mockup compiles/renders without runtime error:
- Find the sandbox port from its workflow log line `Local: http://localhost:<PORT>/__mockup/` (workflow "artifacts/mockup-sandbox: Component Preview Server"). Port is dynamic per boot — don't hardcode it.
- `curl -o /dev/null -w "%{http_code}" http://localhost:<PORT>/__mockup/src/components/mockups/<group>/<Component>.tsx` → 200 means Vite transformed it (compiles); 500 = syntax/transform error. Also curl the `/__mockup/preview/<group>/<Component>` HTML for 200.
- Or just trust the live canvas iframe once the sandbox server log shows no `Failed to resolve import` errors.
