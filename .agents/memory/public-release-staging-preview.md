---
name: Public release page — staging-preview + "View as a fan"
description: How operators privately preview/iterate on the locked public Preview & Purchase page before it goes live, and the host-auth gotcha that governs it.
---

The locked public Preview & Purchase page (`get.goodtunes.music/<share_slug>`) already exists end-to-end. "Making a release live" is data, not code: give the album a `share_slug` and take it out of `prepping`. Two affordances let operators iterate before that:

- **Staging-preview**: the public album-by-slug route resolves a still-hidden/prepping release for a *privileged* viewer; everyone else 404s until it's buy-eligible. The OG/unfurl path stays gated so crawlers can't surface a staged release.
- **"View as a fan" lens**: privileged accounts are exempt from preview-first, so they can never tell what a visitor sees. A floating toggle overrides ownership→non-owner (mirrored to `?fan=1`, shareable) and renders only for privileged accounts.

**Durable gotchas (the non-obvious part):**

- **`get.goodtunes.music` is hard-mapped to the `customer` auth kind with `hostKnown=true`.** `getAuthFromRequest` rejects any session/token whose kind ≠ the host's authKind, so an **admin session is rejected on the get host** and `isAdminUser(req)` is *always false there*. Any "admin-only" behavior on a public share/customer-host route silently no-ops on the exact host that matters. To grant a privileged action on the get host you must recognize a privileged **customer** (e.g. by an email allowlist), not an admin. Same trap applies to the store host.
- The full-access/preview allowlist must be **one shared source** (`shared/fullAccess.ts`) used by both the client playback-access hook and the server gate — they drift apart instantly if duplicated.
- A privilege check that depends on the async `/api/me` query is **false on first render**; any URL-flag (`?fan=1`) hydration must re-run in an effect when privilege flips true, or shared links / reloads silently drop the flag.
- **Nightbirde data is prod-only** (3 prepping releases: two duplicate "Hope", one "Love"); dev has none, and no album in dev *or* prod had a `share_slug` set. You cannot rehearse the real page in dev — test the mechanism against a dev stand-in (set a throwaway slug + `prepping`, curl, revert). Making the real URL live needs prod actions (pick the canonical Hope, set the slug, un-prep); prod is read-only from here.
- Single-segment `/<slug>` is the live convention; artist-namespaced `/<artist>/<release>` (`nightbirde/hope`) is a planned routing follow-up, not built.
