# GoodTunes — Living Status

Last updated: 2026-08-10

This file is the current-state summary for the design studio. It is kept
current, not appended to: stale lines are overwritten when things change.

## 1. Recent changes

### Done and live
- CD + Cassette catalog build pages (handoff/cd-cassette-catalog v1): the CD and Cassette pills on the Catalog page are live, each rendering the handoff design verbatim (dark canon body). CD: case (Sleeve/Jewel) → print (Silkscreen with up to 3 spot colors + press-added custom inks, or full-color offset) → booklet (jewel only) → run pricing. Cassette: case (J-card/O-card) → 8 stock shells (real product photos) → imprint → run pricing; tape length derived from runtime, never picked. Custom spot inks, run prices, and turnaround overrides persist per press (new `cd_catalog`/`cassette_catalog` columns, handoff defaults when untouched). Deep-linkable via `?media=cd|cassette`.
- Press package pricing Catalog page ("Item 28" design): rewind control, 140g/180g shared run-size price books, centered template add/replace dialog with persisted filenames, size/template hide controls (Booklet hidden by default), final copy, "Make it yours" branding dialog with server persistence.
- Apple-canon visual sweep across all 53 super-admin pages, light + dark (two-tone headings, canon hovers/dialogs/empty states, status dots).
- Apple-canon sweep of all partner/operator portals (artist, press, NPO, label, manager, vendor, printer).
- Dark-mode hover fixes (rows turning white).
- Combined press dashboard.
- SVG upload support for press logos, with stored-XSS hardening on the server.
- Press branding dialog made draft-until-Save.
- Dark-mode press logo inversion on the presses list and dashboard.
- Catalog build page tablet layout: two-column from ~900px, sticky left jacket column.
- Admin Albums grid placeholder tiles match the catalog jacket exactly (press label mark, white, on the press's label background); press-less albums show Memphis branding as a display-only default.
- Fixed admin horizontal page overflow on the Catalog tab.
- Rounded "View as this partner" button into a pill.
- Sticky catalog vinyl stage anchored to the top instead of centered.
- Renamed "Reorder" to "Rearrange" in the catalog.
- Removed the bio/turnaround card from the press Catalog tab (data kept, still on Overview).
- Artist self-delete of unsold albums; press/label delete of self-created albums.
- Fix for artists getting "Out of scope" on label-attached albums.
- Early-access 404 fix on prepping albums.

### In progress
- (none right now)

### Not started (proposed task queue)
- ~20 proposed items awaiting go-ahead, including: fan pre-save card, Codemagic sync-failure alert, various test-coverage tasks, dock overlap fixes, Buy-sheet vinyl-fit warning.

## 2. Super-admin press Catalog tab — current behavior
- Each press's detail page has six tabs: Dashboard, Overview, People, Albums, Catalog, Analytics.
- The Catalog tab shows a "Catalog format" segmented control with three pills: Vinyl, CD, Cassette.
- Vinyl is the only live format. It defaults to 12" LP (or the first offered size) and shows: vinyl size tabs, pressing types/tiers, run-size price ladders (140g/180g books), color swatches, print/audio spec templates, turnaround, branding (center-label logo + background), and reorder/hide controls. Saving is explicit ("Edited · Save catalog").
- CD and Cassette pills are live. Each opens its handoff build page (per-format header copy "On disc." / "On tape.", sticky product render on the left — jewel case/sleeve with the peeking disc, or shell photo with the printed piece — and the choice column on the right). Selections are live previews; the persisted parts are custom silkscreen spot inks (CD), the run price ladder, and the turnaround override. Staff see it read-only like vinyl.
- The jacket stage renders a black printed jacket with the press's logo, sticky and top-anchored on desktop.

## 3. Press-facing catalog & artist builder — current behavior
- The press portal (Dashboard, Clients, Projects, Acquisition, Catalog, Settings, Referrals) renders the exact same Catalog component as super-admin, so press users see what operators see.
- Press Owners/Admins can edit everything (formats, prices, colors, branding, templates, GoodDeed printing ladder); press Staff get a read-only view with a notice.
- An "Add your vinyl" colors sub-view handles disc color swatch setup.
- The artist-facing package builder ("Design your package. See what it earns.") pulls from the press's vinyl catalog — sticky jacket preview on the left, decisions and live earnings math on the right. If a press hasn't published a vinyl catalog, artists see a friendly empty state.
- CD and cassette: the press-side catalog build pages are live (same component for press portal and super-admin). The artist-facing package builder still only offers vinyl — CD/cassette builder flow not designed yet.

## 4. Changes made on the agent's own initiative
- Memphis default on press-less album tiles is display-only — no press assignment is written, so it doesn't affect MRP's portal scope, permissions, or pricing.
- Server-side sanitization hardening on SVG logo uploads.
- Design-lint baseline re-snapshots and dark-mode/theming consistency fixes discovered during the sweeps.
- Small robustness fixes from code review (e.g., logo fallback when a press's label mark fails to load).

## 5. Deferred items and why
- CD/cassette in the artist package builder — the press catalog pages are live, but artists can't yet build a CD or cassette package; needs its own design pass.
- CD/cassette price editing — run prices show as fixed pills per the handoff (no edit affordance in the design); presses can't change them in the UI yet.
- The "Print prep" attach row on the CD/cassette pages is display-only per the handoff (no upload wired).
- Press referral-link branding (fan arriving via a press's link sees that press's pricing/logo/imagery) — agreed larger future feature.
- Press-switcher for direct-to-GoodTunes albums — being designed in Playground first.
- Actually attributing press-less albums to Memphis — held back: a real press assignment would pull those albums into MRP's white-label portal, permissions, and pricing. Needs a product decision first.
- Cert accrual/true-up work — parked by design until after Shopify submission.
