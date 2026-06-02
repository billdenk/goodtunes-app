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

## Paste-a-URL entry for People (artists, admins, ambassadors, contacts)

The Add Person / Add Album-artist / Add Admin / Add Ambassador / Invite Artist dialogs all share the same "Paste a URL" affordance at the top of the picker — operator pastes any of an Apple Music artist URL, a Spotify artist URL, a Bandcamp page, or a generic bio page (vendor staff page, label team page, wikipedia-style profile). The server (`POST /api/admin/people/scrape`) detects the source and:

- **Apple / Spotify** — synthesizes a `SpotifyCandidate` and routes through the existing confirm + Apple-discography backfill stage so the admin still gets the streaming-row vs. GoodTunes-release rule the search flow gets.
- **Bandcamp / generic** — extracts `{name, title, bio, photoUrl, links[]}` from JSON-LD `Person` / `MusicGroup` / `MusicArtist` nodes (rejecting `Organization` / `Brand` / `WebSite` per the brand-identity trap), falls back to OG / twitter / `<meta name=description>` tags, and rehosts the photo to Object Storage. The scrape result is **staged in a preview card, not auto-saved** — the operator sees the photo + name + bio + classified link chips and confirms via the explicit "Add to People" / "Enter manually" button before the row is created. Discard clears the staged data and the same paste field can be reused. The originating URL is classified by host into `instagramUrl` / `tiktokUrl` / `twitterUrl` / `blueskyUrl` / `facebookUrl` / `spotifyUrl` / `appleMusicUrl` / `linkedinUrl` / `websiteUrl` (Bandcamp → `websiteUrl` since there's no dedicated column) and folded into the `links[]` payload, first-write-wins.

A 422 from the scrape route means "couldn't find a person" and renders inline under the input so the admin can fill the fields by hand. A 502 means the page was unreachable. Dup-guard against existing People by case-insensitive name match before creating — open the existing row instead of double-creating.

**Gravatar fallback** — `POST /api/admin/people/gravatar` returns `{photoUrl, found}` from `gravatar.com/avatar/<md5>?d=404` (rehosted on hit, silent miss on 404). The same fallback fires automatically inside `POST /api/admin/people` when the request carries `contactEmail` but no `photoUrl`, so email-only Admin / Ambassador entries get a real avatar instead of the default initials circle.

**Why:** People are now the most common Add target (every album-artist, every admin, every ambassador) and operators were typing in name + bio + photo by hand even when a Bandcamp page was one click away. The scrape plumbing (`safeFetchWithUaFallback`, `rehostRemoteImage`, JSON-LD walkers) was already proven on the instrument / vendor / label scrapers — one paste fills the row.

**How to apply:** any new People-adjacent dialog (future "Add Producer", etc.) should reuse the `PersonPicker` in `AddPeopleMenu.tsx` or the paste-row pattern in `NewAlbumArtistDialog.tsx` — don't bolt on a parallel scraper. Honor the brand-identity skip-list when extending `collectPeopleNodes` to new entity types: an `Organization` / `Brand` / `WebSite` JSON-LD node is the *site*, not a person.

## Press People — Invite Artist picker, Owner/Admin vs Staff, invite-link prefill (Task #699)

The Press "People" panel (Contacts on `/admin/manufacturers/:id` and the Press Portal Settings → Staff tab) has three conventions:

1. **Unified Invite Artist picker, with a manual fallback.** The Invite-Artist dialog is one flow: search GoodTunes People first, fall back to inline Spotify import (paste-a-URL), and if neither lands, **"Add manually"** reveals name + email + phone fields. Previously the unknown-artist path 400'd because the invite POST required a `roleScopeId` (an existing Person). Now `POST /api/admin/invites` accepts a bare `name` (+ optional `phone`): when `role==="artist"` and there's no `roleScopeId`, the server mints a placeholder Person and back-fills `roleScopeId` before the SCOPED_ROLES validation runs. So an operator can invite an artist who isn't in the system yet — name is the only hard requirement, and a 400 only fires when name is also blank.

2. **Owner/Admin vs Staff in "Add Admin".** The Add-Admin path (`AttachContactDialog`) shows an Owner/Admin vs Staff selector **for manufacturer scope only**. Owner/Admin grants the full press scope; Staff grants view + invite-artists only (the four edit/payout/master/map verbs are written as explicit deny overrides — see [`docs/roles-and-permissions.md`](./roles-and-permissions.md#manufacturer-press)). The chosen `level` rides on the `partner-contacts` grant (applied immediately when the contact already has an account) and is persisted as `invite_role = 'press_staff'` on the minted invite so accept-time replays the same overrides.

3. **Invite-link prefill + non-blocking domain warning.** When the operator adds a press person, they can prefill the new Person's photo (captured from the paste/scrape step) along with email/phone, so the one-time invite link lands with a populated profile. If the contact's email domain doesn't match the press's website domain, a **non-blocking** amber warning shows ("this email's domain doesn't match the press website") — it's advisory only; hard domain enforcement is out of scope. The press website is threaded down as `entityWebsiteUrl` from `AdminManufacturer` → `OrganizationPeople` → the Add dialog.

## Paste-a-URL entry for shop-like entities (vendors, gear, labels, manufacturers, fulfillment partners)

`AdminVendors.tsx`, `AdminInstruments.tsx`, `AdminLabels.tsx`, `AdminManufacturers.tsx`, and `AdminFulfillmentPartners.tsx` all use the same "Add" dialog — operator pastes the entity's website, the server scraper (`POST /api/admin/vendors/scrape`, `/api/admin/instruments/scrape`, `/api/admin/labels/scrape`, `/api/admin/manufacturers/scrape`, `/api/admin/fulfillment-partners/scrape`) returns OG-derived `{name, domain, logoUrl, …}`, and the create POST surfaces a 409 + `{label|vendor|manufacturer|partner}` payload when the domain is already in the catalog so the UI offers "open existing" instead of double-creating. Typing a plain name (no `https://`) instead of a URL falls back to creating a blank-shell row.

`labels.domain`, `vendors.domain`, `manufacturers.domain`, and `fulfillment_partners.domain` are all lowercased / no-`www.` / unique on non-null. When adding a new "shop-like" admin entity, mirror this exact shape — don't invent a new dedup key.

**Reseller hosts attach as Reseller; the page's brand becomes the Maker.** The Add-gear scraper (`POST /api/admin/instruments/scrape`) classifies the URL's host against a typed `KNOWN_HOSTS` map and returns `{reseller, maker, notice?}` slots instead of a single flat `vendor`. Sweetwater / Guitar Center / Reverb / Musician's Friend / American Musical / Thomann / Carter Vintage attach as **reseller-only**, and the JSON-LD `Product.brand` (mapped through `BRAND_ALIASES`) becomes the **maker** — so pasting a Sweetwater PRS link creates a `prsguitars.com` maker vendor *and* attaches Sweetwater as the reseller in one shot. Manufacturer hosts (Gibson, Martin, Fender, PRS, Taylor, Ernie Ball) attach as **maker-only**, no reseller. Gibson is the lone "both" entry — one vendor row carries both flags. The dialog renders both slots as preview chips before the operator confirms, so a mis-classified page can be discarded with "Try another URL" instead of leaving a junk vendor in the catalog. When Sweetwater / a known reseller blocks the request with 401/403/429 (Akamai bot wall), the route falls back to guessing the name from the URL slug — Sweetwater's `--`-prefixed slugs are handled specifically — and returns the reseller chip with a `notice` explaining the photo + name need a hand-check; unknown blocked hosts still hard-fail with 502 so we don't silently import garbage.

**Gear remembers the page it was scraped from.** When the Add-gear dialog scrapes a URL, the pasted address is persisted onto `instruments.source_url` alongside the rehosted photo. That breadcrumb powers two things: fans see a "View original listing" link under the gear title on `/instrument/:id` (and inside the live `InstrumentPreviewCard`), and admins get a one-click "Refetch image from source" recovery button on the Identity panel whenever `photoUrl` is null — the server re-runs the same image-pick logic the scraper uses (JSON-LD Product.image → og:image → twitter:image) and rehosts. Editing the URL by hand on the Identity panel works the same way; the field validates `http(s)://` shape. A one-shot admin endpoint `POST /api/admin/instruments/backfill-source-url` retro-populates legacy rows that have exactly one reseller listing by copying that listing's `affiliateUrl` — multi-reseller rows stay untouched because picking the "right" listing is too ambiguous to automate.

## Address fields — Google Places autocomplete by default

Every admin address input (vendor / maker / reseller / press / label / fulfillment-partner location + FP shipping address) is wired through `AddressAutocompleteField` (or, inside an `EditablePanel`, by setting the field type to `"address"`). The component proxies through admin-only `/api/admin/places/{status,autocomplete,details}` so the `GOOGLE_PLACES_API_KEY` never reaches the browser, mints a per-typing-burst session token so each autocomplete-then-details pair bills as one Google session, and emits a normalized `{formatted, line1, line2, city, region, postalCode, country}` snapshot — same shape as `StripeAddressSnapshot` in `shared/schema.ts` — when a suggestion is picked. The existing text columns (`vendors.location`, `manufacturers.location`, `labels.location`, `fulfillment_partners.location` + `shipping_address`) store the formatted string; no schema change. When the key isn't set the field silently degrades to a plain `<input>` and a one-time admin banner in `AdminFrame` explains how to turn it on. Don't add a fresh `<input>` for a new admin address surface — reuse the primitive so billing + fallback stay consistent.

## Quickprinter — print-only capability + platform-default GoodDeed routing

GoodDeed certificates always go through the same Quickprinter (Hoover Printing is the seed), so per-album printer/hologram/insertion routing was a foot-gun: every album would have picked the same three vendors and the Sell panel was the wrong surface for changing them. The single source of truth now lives on the `payout_settings` singleton (`default_print_vendor_id`, `default_hologram_vendor_id`, `default_insertion_vendor_id`), edited on **Platform Pricing** (`/admin/platform-pricing` → GoodDeed routing defaults card). The Shopify Sell panel's Cost (live) readout resolves against those three IDs; the legacy `album_addons.{print,hologram,insertion}_vendor_id` columns stay on the table as a back-compat override but the UI no longer writes to them.

Quickprinter is its own vendor capability — `vendors.is_quickprinter` — separate from Maker / Reseller and **mutually exclusive with Maker** (a vinyl press is never a Quickprinter). The Printing picker on the routing-defaults card is filtered server-side to `is_quickprinter = true`, so a press can't be accidentally chosen as the certificate printer.

The Quickprinter's price ladder is per-paper-size (`vendor_gooddeed_services.size_ladders_json`) on a fixed rung set — **50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000**. Letter is the live ladder used by today's certificates; 12×18 is scaffolded as a disabled tab on the editor for the next task that ships large-format certs. Missing rungs walk down to the next-lower rung at price-resolution time, and the legacy `tiers_json` is read as a fallback when `size_ladders_json` is missing — so existing press printing rows keep working unchanged.

**Why:** so operators set the certificate printer once at the platform level (where it belongs) instead of re-picking the same vendor on every album; and so a future paper size doesn't force a schema change.

**How to apply:** any new per-album operational-routing field that always resolves to the same vendor across albums should default at the platform level (payout_settings singleton) with the per-album column kept only as a back-compat override. New paper sizes extend `PaperSize` in `server/vendorGoodDeedPricing.ts` and add a tab in the Quickprinter ladder editor; the walking rule stays the same.

## Production-partner capabilities — one press, up to three jobs (Vinyl / GoodDeeds / Fulfillment)

A single production partner can do more than one job. The capability model lives on the canonical `manufacturers` table as three notNull booleans — `does_vinyl` (default true), `does_good_deed` (default false), `does_fulfillment` (default false) — guarded by a `manufacturers_capability_at_least_one` CHECK so a partner can never end up with zero capabilities. `insertManufacturerSchema` picks them up automatically; `POST`/`PUT /api/admin/manufacturers` accept the three flags (PUT merges the patch over the current row) and reject an all-off payload with a 400, mirroring the `vendors` Maker/Reseller at-least-one guard.

- **Capability selector** — the press detail page (`AdminManufacturer.tsx` → Overview, `PressCapabilitiesCard`) shows three toggle pills (Vinyl / GoodDeeds / Fulfillment) that auto-save on toggle and refuse to turn off the last remaining capability (toast + revert).
- **Presses tab** — `AdminManufacturers.tsx` carries an All / Vinyl / GoodDeeds segmented filter and per-card/row `CapabilityChips` so an operator sees at a glance what each press does.
- **Fulfillment nav union** — `AdminFulfillmentPartners.tsx` lists dedicated `fulfillment_partners` **and** any `manufacturers` with `does_fulfillment = true` in one combined browse list (discriminated `kind`); the press entries carry a "Press" chip and link back to `/admin/manufacturers/:id` (their single source of truth), not into the fulfillment-partner detail page.

**Backfill / domain seeds:** existing rows fill `does_vinyl = true` from the column default. The post-merge `backfill_task_916_capability_flips` (marker `task_916_capability_flips`, domain-keyed so it survives founding-seed ID drift) flips Hoover → GoodDeeds-only and MRP → all three. Hellbender + PMP stay vinyl-only.

**Drift / out of scope:** the GoodDeed *routing-default printer picker* stays vendor-FK-keyed — `payout_settings.default_{print,hologram,insertion}_vendor_id` and `album_addons.*_vendor_id` are real FKs → `vendors.id`, and GoodDeed pricing resolves by vendor id (`vendor_gooddeed_services`). A manufacturer can't be stored there without breaking the FK and zeroing pricing, so the "deeper printer-picker redesign" is a separate task. The in-app RFQ creation UI (a client press-picker) doesn't exist yet either, so there's nothing to filter by capability there yet.

**Why:** GoodTunes' production partners aren't one-job-each — a plant that presses vinyl may also warehouse + ship, and a printer may only mint GoodDeeds. Modeling capabilities as flags on the one canonical partner row (instead of a second entity per job) keeps a partner editable in one place and lets every capability surface filter the same list.

**How to apply:** a new partner capability is a new boolean on `manufacturers` + the CHECK, a pill in `PressCapabilitiesCard`, an optional filter token on the Presses tab, and (if it has its own nav) a union into that nav keyed off the flag. Never split a multi-capability partner into multiple rows.

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

## Per-song splits — publishing + master, basis points, fans see names only

Splits live in two parallel matrices per song: `trackPublishingSplits` (songwriter share + PRO) and `trackMechanicalSplits` (master recording / performance share). Both store `percentBp` (basis points 0–10000) so 33.33% is lossless. Master splits are admin-only — never exposed in any fan-side response.

Admin entry points are intentionally redundant so the operator never has to hunt for the editor:

- **Album → Splits tab** — album-wide matrix with one row per song, dual progress bars (Publishing | Master), 100% balance indicator, and a "Import from sheet" affordance. Edit opens the per-track editor in a dialog.
- **Album → Tracks tab → expanded row → 4th tile** — the Splits tile sits next to Preview / Lyrics / Credits. The grid reflows from 3-up to 2×2 once a fourth tile is present.
- **Person admin → Splits tab** — read-only rollup of every song that person earns on, deep-linked back to `/admin/albums/:id?tab=splits&track=:songId`. Splits are owned by the album editor; the Person rail is a viewport only.

Fan side: `/api/songs/:id` returns `writers: string[]` derived from `trackPublishingSplits` (names only, never % or PRO). Player renders `Written by …` as the final line under GoodSync™ lyrics, inside the bottom scroll mask.

All write routes are gated through `partnerEditGate(req, res, "edit_metadata", scope, { albumIdForLock })` — splits respect the same post-sale lock as the rest of the album's fan-facing metadata; super-admin override + audit trail apply. The lock returns 403 (not a divert) — UI surfaces the lock state via the same `/api/admin/albums/:id/edit-access` probe other admin surfaces use.

Import flow: paste a Google Sheet URL (must be share-link-readable) or CSV; the server proxies the gviz CSV export to sidestep browser CORS. Column aliases are case- and whitespace-insensitive (song/track, name/writer/composer, role, %/percent/split, pro, publisher, kind). `replace: true` wipes existing rows on each affected (song, kind) pair before insert — the typical re-pull pattern when an artist updates their songsheet.

## Vendor-managed GoodDeed pricing (Task #245)

GoodDeed is fulfilled by three independent legs — **Printing**, **Hologram + shrinkwrap**, **Insertion** — each owned by a `vendors` row that has quoted its own price. There are two entry points:

- **Super-admin** edits any vendor's pricing under `/admin/vendors/:id` → GoodDeed Services tab. Same surface for both maker- and reseller-mode vendor pages.
- **Vendor-scoped partners** (role=`vendor`, `role_scope_id=<vendorId>`) sign in and land on `/vendor` — a stripped-down shell that mounts the same `GoodDeedServicesTab` for their own vendor only.

API contract:

- `GET/PUT /api/admin/vendors/:id/gooddeed-services` — list / upsert one service row at a time. Auth: super_admin OR matching vendor scope.
- `GET /api/admin/gooddeed-vendors?service=printing|hologram|insertion` — vendors with an *active* row for that leg. Drives the album-side picker.
- `PATCH /api/admin/albums/:id/signed-cert-vendors` — assign / clear any subset of the three legs on the album's `signed_cert` addon (`printVendorId`, `hologramVendorId`, `insertionVendorId`).
- `GET /api/admin/albums/:id/gooddeed-pricing-preview?runQty=N` — live wholesale total at run size N. Returns the snapshot too once stamped.
- `POST /api/admin/albums/:id/gooddeed-snapshot` (super-admin) — stamps the per-release pricing snapshot onto the addon at sale-window close. Vendor price edits no longer affect that release once stamped.

Pricing edits **bypass the partner-permissions post-sale lock** the way `manage_payouts` does — operational routing has to stay live after first sale. The lock still applies to fan-facing addon price/min/quantity edits via the normal `edit_metadata` verb.

Tier-walking rule for printing: at run quantity Q, pick the highest tier whose `qty` floor is ≤ Q; if Q falls below the smallest break, pick that smallest tier (we don't invent a fall-through — the vendor decides their floor charge).

## Admin image uploads — invalidate through the shared helper

Every admin detail page (Vendors / Makers, Presses, Labels, People, Albums, Instruments) renders three surfaces off the same entity row at once: the modal's CURRENT thumbnail, the page-header avatar, and the iPhone live-preview card on the right. After any image write (logo, cover, photo, artwork — upload, paste-URL, remove, lock toggle, scrape-refresh) all three must repaint in roughly one tick without a manual refresh.

The hazard is that each detail page picks its own query-key shape — most use the `["/api/<thing>", id]` tuple, but AdminVendor uses the full URL as a single-element key (`[\`/api/vendors/${id}/profile\`]` or `[\`/api/makers/${id}/profile\`]`) because it switches endpoints based on the maker-vs-reseller route. React Query's partial matcher doesn't bridge those two shapes, so a `["/api/vendors", id, "profile"]` invalidation against the URL-keyed query is a silent no-op and the page goes stale.

**Rule:** never hand-roll `qc.invalidateQueries({ queryKey: [...] })` after a write that touches an entity's image. Call `invalidateAdminEntity(qc, kind, id)` from `client/src/lib/adminEntityInvalidation.ts` instead. The helper owns the full key set per entity in one place; if a future surface starts reading the entity off a new key, add it to the helper and every callsite benefits.

**Why:** because the bug is invisible at write time — the mutation succeeds, the toast fires, no error is logged, the cache simply doesn't know to refetch. Centralizing the key set is the only honest way to keep all three surfaces in sync across six admin pages and the maker/reseller mode-switch.

**How to apply:** image writes go through the helper. For the rare component that takes a static invalidate-array prop (e.g. `EditablePanel`), inline-mirror the same keys the helper would produce so the static prop and the helper agree. When wiring a new admin detail page, add its kind to `AdminEntityKind` and the switch before shipping the upload UI.

## Person sheet — content guardrails

The public, fan-facing Person sheet (and any artist bio surface we ingest) must **not** include legal-issue, criminal-allegation, lawsuit, or controversy content, even when the source (Wikipedia, Roon, MusicBrainz, etc.) has those sections. When ingesting biographies, filter out sections titled along the lines of "Legal issues", "Allegations", "Controversy", "Lawsuits", or any incident/court coverage — keep early life, career, discography, charity work, family, and music-related content only. This is a product rule, not a one-off Nick decision.

## Soft-delete trash (super-admin recycle bin)

Every admin Delete is a soft-flip, not a hard DELETE. Fourteen tables — `albums`, `songs`, `album_videos`, `album_photos`, `album_credits`, `people`, `band_members`, `instruments`, `labels`, `vendors`, `manufacturers`, `fulfillment_partners`, `track_writers`, `track_performers` — carry a `(deleted_at, deleted_by_user_id, deleted_via_parent_id)` trio. The Delete handler routes through `softDeleteEntity(kind, id, userId?)` in `server/softDelete.ts`, which:

- Stamps `deleted_at = now()` and `deleted_by_user_id = caller` on the row.
- Cascades the flip to dependent rows (album → songs/videos/photos/credits; song → track_writers/track_performers; person → band_members on both sides). Cascaded rows record `deleted_via_parent_id` so Restore can identify what was taken down with the parent.
- Hard-DELETEs join-table rows that have no fan-visible identity of their own (`playlist_songs`) — keeping a deleted song in a playlist is worse than removing it cleanly.

Every list/detail read filters `WHERE deleted_at IS NULL`, so the rest of admin and the customer surfaces never see soft-deleted rows.

**Recycle bin UI** — `/admin/trash` (sidebar → System → "Deleted items"). Page is super-admin only and self-gates on a 403 from `GET /api/admin/trash`. Each row shows kind, label, deleted-at, days-until-purge, and Restore / Purge buttons. The three endpoints are `GET /api/admin/trash`, `POST /api/admin/trash/:type/:id/restore`, `DELETE /api/admin/trash/:type/:id` — all `requireAdmin + requireSuperAdmin`.

**Restore** un-stamps `deleted_at` on the row and on any children with a matching `deleted_via_parent_id`. **Purge** hard-DELETEs immediately (the parent's cascade FKs clean up dependents).

**30-day sweeper** — `server/index.ts` arms a daily tick (60 s after boot, then every 24 h) that calls `sweepExpiredTrash(30)` to hard-DELETE any row whose `deleted_at` is older than 30 days. A guard variable prevents overlap.

**What this is not** — object-storage blobs (album art, audio, person photos, vendor logos) are **not** copied to a recycle area. A purge does not delete the blob, and a soft-delete does not hide it from `/objects/uploads/<id>`. Restoring a row puts its existing image URL back into circulation. Customer and order tables (`customer_users`, `orders`, `order_items`, `subscriptions`, etc.) are out of scope — those use status fields and refund flows, not soft-delete.

**Schema migration** lives in `scripts/post-merge.sh` (`migrate_soft_delete`) and runs idempotently against both `DATABASE_URL` and `PROD_DATABASE_URL` after every merge. Per the dev↔prod drift rule, the columns must exist on both DBs before publish or the Replit publish dialog will try to drop them from prod.

## Shopify tab — explainer + content-readiness parity (Task #540)

The album's Shopify tab opens with three label-facing surfaces above the existing Push / Sales / Mappings sections:

1. **"How the Shopify path works" explainer** — dismissible per browser via `localStorage["gt:shopify:explainer:dismissed"]`. Plain-English four-step recap so a label reading the tab for the first time can explain the path in one sentence ("you give us your Shopify product link, we match it to your tracks + art + bonus content, and we hand you a snippet to paste into the product page").
2. **Content-readiness checklist** — cover art, track masters, 30-second previews, bonus content. Each row jumps to the **same** Tracks / Bonus / artwork modal the direct-to-fan flow uses (`onJumpToTab` callback wired from `AdminAlbum`). Parity = one set of uploaders, not a duplicate Shopify-only stack. Don't add a parallel uploader on the Shopify tab; if a new content surface lands on Tracks/Bonus, just add a checklist row.
3. **Per-album product-page snippet** — appears only once the album has been pushed to Shopify (`pushStatus.push` non-null). Generates a self-contained HTML badge with the album id baked in for pasting into the Shopify product description, with one-line "where do I paste this" instructions. The order-confirmation Liquid block at `/admin/shopify` is the email-side complement; this card is the product-page side.

**How to apply:** any new "explainable upload flow" tab (future Bandcamp / Squarespace integrations) should follow the same shape — dismissible explainer at top, checklist that jumps into the shared content tabs, paste-this snippet at bottom — so labels see one mental model across distribution channels.
