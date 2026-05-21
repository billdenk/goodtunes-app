# Admin Conventions

## Debugging — always check prod alongside dev

When diagnosing any reported failure (import jobs, audit logs, missing rows, "I don't see X in the UI"), query **both** databases before drawing conclusions. The dev DB and prod DB diverge constantly — the user does most of their real work against the deployed app, so a clean dev DB doesn't mean the bug isn't real. Use `executeSql({ environment: "production" })` (read-only SELECTs only) for the prod read; never assume a single-environment query is the full picture.

## Streaming rows vs GoodTunes releases — intentionally independent

A streaming-imported album (Apple/Spotify-sourced, `is_goodtunes_release=false`, `mzstatic` artwork, populated `appleMusicUrl`) and a GoodTunes-original album (`is_goodtunes_release=true`, your own artwork + uploaded tracks) for the **same artist + same title** are **not** duplicates to be merged. They serve different jobs:

- The streaming row points fans out to the existing Apple/Spotify release.
- The GoodTunes row is the full GoodTunes edition (full tracks, bonus material, credits, lyrics, etc.) curated by us.

Treat `(artist, lower(title))` collisions across the `is_goodtunes_release` boundary as expected. Don't propose dedupe, don't auto-claim, don't merge on import. Surface them in admin only as informational (so the operator knows both exist), never as a warning that needs action. The two-row pattern is the product design.

## Paste-a-URL entry for shop-like entities (vendors + labels)

Both `AdminVendors.tsx` and `AdminLabels.tsx` use the same "Add" dialog — operator pastes the entity's website, the server scraper (`POST /api/admin/vendors/scrape`, `POST /api/admin/labels/scrape`) returns OG-derived `{name, domain, logoUrl, …}`, and the create POST surfaces a 409 + `{label|vendor}` payload when the domain is already in the catalog so the UI offers "open existing" instead of double-creating.

`labels.domain` mirrors `vendors.domain` (lowercased, no `www.`, partial-unique on non-null). When adding a new "shop-like" admin entity, mirror this exact shape — don't invent a new dedup key.

## Admin index pages — grid / list toggle

The five admin index pages (Albums, People, Gear, Vendors, Labels) all carry the same Apple-Music-style **Grid / List** segmented control in the header. The primitive lives at `client/src/components/admin/ViewModeToggle.tsx` and exports both the toggle and the `useViewMode(entity)` hook. Preference is persisted **per entity** (`gt:admin:view:<entity>`) so list-mode on Vendors sticks to Vendors while Gear can stay on grid.

**Canonical entity tokens** — used identically for the `useViewMode(…)` key, the `testIdPrefix`, the `row-<entity>-<id>` / `list-<entity>` / `grid-<entity>` testids, and any future per-entity storage namespace: `albums`, `people`, `instruments`, `vendors`, `labels`. Note "Gear" is only the user-facing label — the data entity (and therefore the token everywhere in code) is **`instruments`**. Don't introduce a parallel `gear` token; it splits selectors and storage keys.

- **Grid view**: the entity's tile/card layout (square album/instrument art, circular avatars, etc.). Density-optimized for browsing visual catalogs.
- **List view**: a single-column compact table — `rounded-lg border bg-white divide-y divide-slate-100`, with row testids `row-<entity>-<id>`. Thumbnail 40–48px, name + secondary line on the left, meta (label / domain / type+year / vendor count) right-aligned. Density-optimized for scanning a long list.

When adding a new admin index page, follow the same pattern: `useViewMode("<entity>")`, place the `<ViewModeToggle>` in the right-side header cluster, and render a per-entity `<EntityRow>` for the list branch.

## Admin cross-section deep links — `?from=<entity>&<entity>Id=<id>`

Many admin entities relate to each other (a Person plays Gear, Gear is sold by a Vendor, an Album is on a Label). When the operator pivots from one entity's detail page into a related entity's detail page (e.g. Gear → Vendor, Gear → Person, Person → Gear), the destination's first breadcrumb should swap from the canonical section root ("Vendors", "People", "Gear") to a **back-link at the origin row**, and the section-not-found error state should offer "Back to {origin name}" instead of "Back to {section}".

The signal is a pair of query-string params on the destination URL:

```
/admin/<destEntity>/<destId>?from=<originEntity>&<originEntity>Id=<originId>
```

Examples:
- Gear → Vendor: `/admin/vendors/v_123?from=instrument&instrumentId=i_77`
- Gear → Person: `/admin/people/p_42?from=instrument&instrumentId=i_77`
- Person → Gear: `/admin/instruments/i_77?from=person&personId=p_42`

The destination consumes the params via the shared `useSmartBackCrumb()` hook at `client/src/hooks/useSmartBackCrumb.ts`, which:

- Reads `?from=<entity>` + the matching `<entity>Id=<id>` param.
- Fetches `/api/<entity>/{id}` so the crumb reads the row's real name (not just "Gear").
- Returns `{ origin, id, name, href, testId }` or `null` when no origin is present.
- Falls back to the canonical section root crumb when null — direct visits keep reading normally.

**Adding a new cross-section pivot:**

1. On the **origin** page, render the deep link with `?from=<entity>&<entity>Id=<id>` on the row that pivots. Reuse the inline-link treatment (inherit color → brand-blue + underline on hover).
2. If your destination entity is new to the hook, add it to the `ORIGINS` map in `useSmartBackCrumb.ts` (param name + API path + admin href + testid prefix + fallback name).
3. On the **destination** page, call `useSmartBackCrumb()` once and use the returned crumb in both the breadcrumb chain and the not-found error state. No further state is needed — refreshes and shared deep-links work because the signal lives in the URL.

Currently wired: Gear ↔ Vendor, Gear ↔ Person. Album ↔ Person, Album ↔ Label, Vendor ↔ Label use the same primitive — wire them in when their cross-section tabs ship.

## Person sheet — content guardrails

The public, fan-facing Person sheet (and any artist bio surface we ingest) must **not** include legal-issue, criminal-allegation, lawsuit, or controversy content, even when the source (Wikipedia, Roon, MusicBrainz, etc.) has those sections. When ingesting biographies, filter out sections titled along the lines of "Legal issues", "Allegations", "Controversy", "Lawsuits", or any incident/court coverage — keep early life, career, discography, charity work, family, and music-related content only. This is a product rule, not a one-off Nick decision.
