---
name: SSRF-safe server-side OG/social image rendering
description: How to safely fetch a user-supplied art URL when rendering server-side social/OG images, without breaking dev.
---

Any server route that renders a social/OG/share image (e.g. a 1200×630 link-preview PNG via `@napi-rs/canvas`) and pulls in an album-art / avatar URL taken from a **public query param** is an SSRF sink: an attacker can point it at `169.254.169.254` (cloud metadata) or internal LAN services.

**Layered defense that actually works here:**
- **Primary: same-host check.** Resolve the art URL against our own request origin and require `target.host === origin.host`. This alone kills the metadata-IP / off-host attacks, because their host ≠ our host. Relative paths (object storage `/objects/...`, `/public-asset.png`) resolve to our origin and pass.
- **Secondary (spoofed-Host edge case): block private/link-local ranges** — `10.`, `192.168.`, `172.16–31.`, `169.254.`, IPv6 `fe80:`/`fc`/`fd`, `*.internal`. Defends the case where the Host header is spoofed so origin host === art host.
- **Fetch the bytes yourself** (don't hand the URL to `loadImage`): `fetch(url, { redirect: "error", signal: AbortController(4s) })`, require `content-type` starts with `image/`, cap size (~8MB), then `loadImage(buffer)`. Closes redirect-to-internal, slow-loris, and content-type-confusion.
- On any failure, fall back to a gradient — never error the route.

**Why:** `**Do NOT block loopback/localhost.**` In dev the app's own origin *is* `localhost:5000`, and curl tests hit it via `localhost`; blocking `localhost`/`127.`/`::1` silently makes legitimate same-host art fall back to the gradient (real regression caught in review). Loopback only ever resolves back to this app anyway, so the same-host check already makes it safe.

**How to apply:** when adding/reviewing any server-rendered share/OG image that takes an image URL from the client, verify all of the above; verify by curling same-host art (renders, large PNG) vs `art=http://169.254.169.254/...` and an off-host URL (both fall back to the small gradient PNG). Remember the backend has no hot-reload — restart "Start application" before curling.
