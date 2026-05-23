# Admin Conventions

## Platform pricing — snapshot, don't recompute

Platform-wide costs (today: the certificate cost on `payout_settings.cert_cost_cents`, the Shopify fee on `payout_settings.shopify_fee_cents`) drive the artist's per-unit profit on every Sell panel. The Platform Pricing page at `/admin/platform-pricing` is super-admin-only and writes the singleton row. Other admin roles can still **read** the settings (the GET is open to admin) so the SellPanel can render its profit readout.

When an artist saves the `signed_cert` add-on, we **snapshot** the live `cert_cost_cents` onto `album_addons.cost_cents_snapshot`. The Sell panel's "You earn $X.XX per unit" readout subtracts that snapshot, not the live setting. Re-saving the add-on picks up the new platform price. This price-lock rule is the contract: a super-admin raising the platform cost must not silently turn an already-sold artist add-on into a loss in the readout — they only see the new number on their next save.

**Why:** so the artist's understanding of their margin is stable until they explicitly re-confirm it, and so changes to platform cost can propagate via deliberate re-save instead of being applied retroactively.

**How to apply:** any new platform-wide cost that participates in an artist-facing profit readout must (a) be editable only on the Platform Pricing page, (b) be snapshot onto the artist-controlled row at save time, and (c) be read from the snapshot in the readout — falling back to the live value only when the row predates the snapshot column.

## Debugging — always check prod alongside dev

When diagnosing any reported failure (import jobs, audit logs, missing rows, "I don't see X in the UI"), query **both** databases before drawing conclusions. The dev DB and prod DB diverge constantly — the user does most of their real work against the deployed app, so a clean dev DB doesn't mean the bug isn't real. Use `executeSql({ environment: "production" })` (read-only SELECTs only) for the prod read; never assume a single-environment query is the full picture.

## Streaming rows vs GoodTunes releases — intentionally independent

A streaming-imported album (Apple/Spotify-sourced, `is_goodtunes_release=false`, `mzstatic` artwork, populated `appleMusicUrl`) and a GoodTunes-original album (`is_goodtunes_release=true`, your own artwork + uploaded tracks) for the **same artist + same title** are **not** duplicates to be merged. They serve different jobs:

- The streaming row points fans out to the existing Apple/Spotify release.
- The GoodTunes row is the full GoodTunes edition (full tracks, bonus material, credits, lyrics, etc.) curated by us.

Treat `(artist, lower(title))` collisions across the `is_goodtunes_release` boundary as expected. Don't propose dedupe, don't auto-claim, don't merge on import. Surface them in admin only as informational (so the operator knows both exist), never as a warning that needs action. The two-row pattern is the product design.

## Press-invited partners — hard-locked Sell-panel Presses surface

When a manufacturer (pressing plant) admin with `inviteSubusers` invites an artist or label onto GoodTunes, the invite-accept handler stamps `people.invited_by_press_id` / `labels.invited_by_press_id` with the inviting press. That stamp gates two things on the partner's side:

1. **Sell-panel Presses surface** — the partner sees only the inviting press's card (with a lock note) until any of their albums has an order in `orders.fulfillment_status='shipped'`. Once a run ships, the full pressing-plant directory unlocks with the inviting press still floated to the front and highlighted. No "see other plants" disclosure is shown to the partner while locked — the message is "your press" and "message GoodTunes if you need to switch sooner."
2. **Cost calculator defaults** — `GET /api/admin/albums/:id/invited-press` returns the inviting press's `press_format_costs` rows merged over the platform `payout_format_costs` defaults format-by-format **plus** the inviting press's `catalog` tree (formats → color tiers → ladder + colors). The SellPanel's draft-SKU Cost readout reads the publishing / payment-processing / GoodTunes-margin lines from the merged format-costs and reads the per-unit manufacturing cents from the picked tier's ladder snapping the typed quantity up to the next rung. When the inviting press has a catalog, the "+ Add physical good" menu is restricted to the formats that catalog offers; free / non-invited albums fall back to the full `ALBUM_FORMATS` list with the legacy Hellbender matrix driving vinyl manufacturing.

Super-admin can clear or reassign the press at any time via `PATCH /api/admin/{people|labels}/:id/invited-press` (surfaced in the partner's Identity panel as the InvitedByPressPanel) — useful if the relationship sours. The lock is per-partner, not per-album, and shipping the first run is irreversible (no re-locking after unlock).

**Why:** so a press that recruited a partner gets a guaranteed first run on its own machines without GoodTunes hard-coding exclusivity, and so the cost-calculator numbers match the press the partner is actually about to use.

**How to apply:** any new partner-onboarding referrer kind that wants a similar lock should mirror this exact shape (referrer-scope column on the partner table, single GET endpoint returning the locked-entity + `hasShippedFirst` flag + merged defaults, super-admin-only override panel on the partner detail page). Do not add a "request to unlock" UI on the partner side — escalation is out-of-band by design.

## Paste-a-URL entry for shop-like entities (vendors, gear, labels, manufacturers)

`AdminVendors.tsx`, `AdminInstruments.tsx`, `AdminLabels.tsx`, and `AdminManufacturers.tsx` all use the same "Add" dialog — operator pastes the entity's website, the server scraper (`POST /api/admin/vendors/scrape`, `/api/admin/instruments/scrape`, `/api/admin/labels/scrape`, `/api/admin/manufacturers/scrape`) returns OG-derived `{name, domain, logoUrl, …}`, and the create POST surfaces a 409 + `{label|vendor|manufacturer}` payload when the domain is already in the catalog so the UI offers "open existing" instead of double-creating.

`labels.domain`, `vendors.domain`, and `manufacturers.domain` are all lowercased / no-`www.` / partial-unique on non-null. When adding a new "shop-like" admin entity, mirror this exact shape — don't invent a new dedup key.

## Vendors carry two role flags — Maker + Reseller (one row, both flags)

The `vendors` table carries `is_maker` and `is_reseller` booleans (both default-true on insert via the admin "Add" dialog, but the surface you create from decides which flag the new row gets set to — the other defaults off). A single row can carry **both** flags: Gibson is a Maker (builds the gear) *and* a Reseller (sells it direct), and that's the expected shape — don't split the row.

- `AdminVendors.tsx` is mode-aware via two `useRoute` calls (`/admin/vendors` → reseller mode, `/admin/makers` → maker mode). The same component renders both index pages. The list query embeds the filter in the URL string (`/api/vendors?role=maker`) so the default `queryKey.join("/")` fetcher works without a custom `queryFn`.
- The detail page (`AdminVendor.tsx`) is shared too, and shows a **Roles panel** below Overview with two toggles. PUT `/api/admin/vendors/:id` accepts partial `{ isMaker, isReseller }` patches and the UI refuses to land in the zero-role state (toast + revert) — a vendor must always be at least one of the two.
- The Gear page (`AdminInstrument.tsx`) Overview gets a **MakerPickerPanel** typeahead that writes `instruments.makerVendorId` via PUT `/api/admin/instruments/:id`. The "Resellers" tab (key still `vendors` so deep links don't break) drives the legacy reseller join table.

If you add a new vendor-adjacent admin surface, follow the same shape: route on `/admin/makers/...` for Maker context, keep the URL-string `?role=` filter, and never invent a third role token.

## Press Catalog (formats → tiers → colors → quantity ladders)

Each press's pricing is editable on the press detail page (`AdminManufacturer.tsx` → **Catalog** panel, replaces the old "Per-format costs" panel). Shape (`shared/schema.ts`): one `press_formats` row per format the press runs, with N `press_color_tiers` underneath it (name + `priceLadder` jsonb of `{qty, unitCents}` rungs), each with N `press_colors` (name + hex swatch). `seedHellbenderCatalog()` in `server/pressCatalog.ts` lazily materializes Hellbender's three tiers (Black / Standard color / Regrind) for 7″ and 12″ LP from `shared/pressing.ts` on first read, so existing Hellbender invitees keep working without a backfill.

Cost knobs split by surface — don't cross the streams:
- **Press catalog** (per-press, on the manufacturer page) = formats offered + per-tier price ladder + colors. This is the *only* place per-unit manufacturing cents are configured for invited-press vinyl.
- **Platform pricing** (super-admin, `AdminPlatformPricing.tsx`) = the `payout_format_costs` table edited via `PUT /api/admin/payout-format-costs/:format`. Carries publishing fee, payment processing, and the GoodTunes margin charged on every unit; the `manufacturingCents` line stays as a placeholder fallback for non-vinyl + non-invited free flow only.

SellPanel composition (see also the bullet in the invited-press section above):
- `+ Add physical good` lists *only* the formats the invited press's catalog covers (free / non-invited albums see the full `ALBUM_FORMATS` list).
- The vinyl row's color picker becomes a progressive **tier → color → quantity** picker driven by the catalog. Quantity snaps up to the next ladder rung (or shows "{topRung}+ — request a custom quote" above the cap).
- Save sends `pressTierId` + `pressColorId` to `PUT /api/admin/albums/:id/skus/:format`; the server snapshots `vinylColorTier` (tier name), `vinylColor` (color display name), `quantityTier` (snapped qty), and `costSource: "catalog"` onto the SKU. SKU storage shape is unchanged from #200, so checkout / cart / payout are untouched.

**Why:** decoupling per-press manufacturing pricing from platform-level fees means a new press can be onboarded without GoodTunes super-admin touching the cost calculator, and a platform fee change rolls out without disturbing each press's negotiated rates.

## Pressing plants are "Presses", not "Manufacturers"

The vinyl/CD pressing-plant entity (`AdminManufacturers.tsx`, route `/admin/manufacturers`, sidebar key `manufacturers`) is **labelled "Presses"** everywhere user-facing — page titles, "Add press" button, empty/error states, delete-confirm copy. URL + sidebar key + filename stay as `manufacturers` so backlinks don't break, but every visible string reads "Press" / "Presses". The rename exists so the word "Manufacturer" doesn't blur with instrument Makers (a Maker builds the gear; a Press stamps the vinyl).

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
