# Canon reconciliation matrix — task 3474

**Current state as of September 4, 2026 · development visual-review packet, not a production acceptance certificate**

## Purpose and evidence rule

This document reconciles the complete visible GoodStudio Canon package at
`handoff/otis-final-canon-readiness-2026-09-04/`, the current route and
partner-module registries, the production components, the living status, and
the complete 68-row MRP control in
`docs/mrp-ask-reconciliation-2026-09-04.md`.

The package contains twelve TSX source artifacts representing ten distinct
surfaces. Two of the twelve are R&D-owned snapshots of two other surfaces; they
are provenance-bearing implementation inputs, not additional routes. The
package README authorizes two specific implementation scopes:

1. the **Admin Artist Profile** presentation; and
2. the **Press Template Test ordered multi-page proofing** upgrade.

Task 3474 separately authorizes a broader **visible Canon reconciliation**:
route/state/theme/viewport inventory, shared album-workspace framing, Package
and Physical navigation, and development screenshots for Bill/Ruby review. It
does not authorize invented functionality, MRP configuration, prices, routes,
permissions, or data contracts. The original README remains controlling for
behavioral change; the broader task changes the visual-review and evidence
boundary only.

The development routes were exercised with real development records and the
checked-in four-page MRP acceptance fixtures. Development screenshots and
viewport overflow measurements are recorded below. No production system was
queried, no publication was performed, and no development screenshot is a
production receipt. A source file, test result, build result, mock asset, or
README acceptance instruction is supporting evidence only unless this document
names a corresponding route capture.

### Status vocabulary

- **Verified** — the current implementation has matching, checked-in visual
  evidence for the stated route/theme/width. Unless a production URL and dated
  production receipt are named, this means development-verified only.
- **Built-unverified** — production code is present, but required visual and/or
  published-production acceptance evidence is absent.
- **Partial** — only part of the surface, state matrix, or viewport/theme matrix
  is implemented or evidenced.
- **Differently delivered** — the approved outcome exists through a different
  production information architecture or authoritative renderer, with the
  difference explicitly recorded.
- **Outstanding** — no authoritative production implementation is evidenced.
- **Blocked** — completion depends on a named missing fixture, production
  publish/receipt, or owner-supplied input. Blocked is not a synonym for
  unimplemented.
- **Ready for visual review** — the assigned development implementation and
  named screenshot matrix are complete enough for Bill/Ruby to review. This is
  explicitly weaker than Ready for Canon and does not authorize publication.

## Route and role controls

The current route authority is `client/src/App.tsx`. The relevant registered
routes are:

- `/admin/people/:id` → `AdminPerson`, behind `ProtectedRoute`.
- `/artist` → `ArtistDashboard`, behind `ProtectedRoute`.
- `/artist/albums/:id` → `ArtistDashboard`, which embeds `ArtistRelease`.
- `/artist/albums/:id/art-test/:componentId` → `ArtistDashboard`, which embeds
  `ArtistTemplateTest`.
- `/admin/albums/:id` → `AdminAlbum`; `?tab=sell` selects the shared package
  builder presentation.
- `/vendor` and `/vendor/albums/:id` → `VendorPortal`; a maker/press is routed
  into the press portal. Template index and test views are query-selected
  surfaces, not separate path routes:
  `/vendor?tab=templates`,
  `/vendor?tab=templates&template=<specId>`, and
  `/vendor?tab=templates&livetest=1`.

The partner authority is `client/src/components/operator/registry.ts`.
`modulesForRole("artist")` currently exposes Dashboard, Releases, Audience,
Acquisition, Orders, Buyers, Referrals, Shopify, Reports, and Settings. The
same registry and exported `ARTIST_PORTAL_TABS`/`ArtistTabBody` drive the
super-admin artist mirror: one body, two chromes. There are no standalone
Overview, Cover, Streaming, Gear, Splits, Payouts, or Permissions artist-portal
modules merely because an earlier mock labels tabs that way.

`modulesForRole("press")` exposes Templates under Product Specs. `PressPortal`
mounts `PressTemplatesTab`, which selects `PressTemplatesIndex` or
`PressTemplateLiveTest`. This is the real partner route for the handoff's press
proofing surface.

All invited operator/partner portals are expected to be theme-aware in light
and charcoal dark; navy belongs only to fan surfaces. The September 4 README
explicitly requires the two authorized scopes at 1440, 1024, and 768 pixels in
both themes. At 1440 the full rail/content composition is expected; at 1024 the
same workflow must remain usable without horizontal overflow; at 768 the
compact/tablet shell may reflow or collapse navigation, but may not remove the
workflow or controls. The package does not define a separate phone-width
acceptance capture below 768. Mobile behavior must therefore follow the
production responsive shell and 44-point control rules, and is not claimed
verified here.

## GoodStudio surface-to-production matrix

| GoodStudio source / distinct surface | Real route and production component | Role | Appearance contract | Desktop / tablet / mobile expectation | Required runtime states | Current implementation status | Existing development screenshot evidence |
|---|---|---|---|---|---|---|---|
| `mockups/AdminArtistProfileInteractionCanon.tsx` — Admin Artist Profile | `/admin/people/:id` → `AdminPerson`; real artist tab bodies come from `ARTIST_PORTAL_TABS` and `ArtistTabBody` in `ArtistDashboard.tsx` | Super admin viewing an artist | Light + charcoal; white proof media remains white | 1440 full admin frame; 1024 no-overflow frame; 768 compact frame; phone not separately specified | ready, loading, load error/retry, permission-reduced/read-only; real identity, URL, bio, releases, links, notifications, Shopify, production press, referral source, view-as, media, GoodDeed and tabs; dialogs must preserve cancel/confirm semantics | **Partial — required shell/theme/viewport slice development-verified; production blocked.** Approved skin and real handlers are built with named adaptations. Mock tab names/local state were not copied. The real registry remains authoritative; referral and production press remain separate; unsupported person-level task state was not invented. The real Ava Marlowe Settings route is evidenced across the required matrix with no document-width overflow. Other tabs, dialogs, reduced-permission states, and production remain unverified. | `screenshots/canon-reconciliation-2026-09-04/admin-artist-profile-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png` (six files). These prove the live-data Settings slice and shell, not every profile action/state and not production. |
| `mockups/ArtistDashboardAccountStack.tsx` — shared artist account/dashboard stack | `/artist?tab=<module>` → `ArtistDashboard`/`ArtistTabBody`; operator mirror at `/admin/people/:id?tab=<module>` → `AdminPerson` using the same body | Artist; super-admin mirror | Light + charcoal | Wide left rail; tablet responsive shell; production mobile shell/44-point controls | role/scoped view, view-as, dashboard range, all registry tabs, releases/detail drill-in, dialogs, empty/loading/error/read-only and connected/disconnected integrations | **Differently delivered / built-unverified.** The production one-body/two-chromes architecture is present, but the manifest mock's local role toggle, mock records, hash navigation, and obsolete tab assumptions are not contracts. Real registry modules and queries are used instead. No complete visual state matrix is evidenced. | The six Admin Artist Settings images cover only the operator-mirror Settings body. No checked-in `/artist` dashboard/account-stack screenshot for this package was found. |
| `mockups/ArtistDashboardNextSteps.tsx` — collapsible dashboard Next Steps strip | Intended artist Dashboard at `/artist?tab=dashboard`; operator mirror would be `/admin/people/:id?tab=dashboard` through `ArtistTabBody` | Artist; possible read-only operator mirror | Source is charcoal; production portal contract requires light + charcoal | Full strip in desktop content; reflow at 1024/768; stacked touch-safe rows on phone | collapsed default, expanded lifecycle, done/up-next/waiting, upload action/success, reduced motion, empty/all-caught-up truthfulness | **Partial / outstanding for the handoff behavior.** The approved profile implementation explicitly did not create a person-level Next Steps record because no authoritative queue exists, and suppresses the false “You’re all caught up” claim in operator mirror. No mock lifecycle or upload mutation was shipped. A truthful data contract remains outstanding before the strip can be completed. | None. The white-label MRP dashboard components and unrelated Hellbender preview images are not evidence for this GoodTunes artist-profile surface. |
| `mockups/ArtistReleasePackageTemplates.tsx` — release package templates/custom builder/agreed record | Shared builder is real at `/admin/albums/:id?tab=sell` → `AdminAlbum` → `PressAlbumPackageBuilder`; artist release remains `/artist/albums/:id` → `ArtistRelease` | Super admin; artist-scoped release experience | Light + charcoal; package media follows Canon dark-art treatment | Two-column/sticky where space permits; tablet must retain bounded builder and record; mobile stacks controls and summaries | package list/select/prefill, build-from-scratch, dirty/saved, draft/agreed, request change, artwork slot launch, quantity/pricing and read-only/permission gates | **Differently delivered / partial; operator workspace development-verified.** The operator Package tab intentionally reuses the exact artist production builder inside the shared full-width Canon frame. Ruby's approved release navigation remains Dashboard/Details/Assets/Store/Payments, so no duplicate artist Package tab was added. Real pricing, estimates, saves and permissions remain authoritative. The ready operator route is evidenced in both appearances at all three required widths; deeper builder states and production remain unverified. | `screenshots/canon-reconciliation-2026-09-04/admin-album-package-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png` (six files), with no document-width overflow. |
| `mockups/VinylPackageArtwork.tsx` — package artwork stage and importer dialog | Artwork portions of `/artist/albums/:id?tab=assets` → `ArtistRelease`; shared package artwork is consumed by the production package builder | Artist; operator through shared release/package workflows | Light + charcoal; artwork itself is never recolored | Desktop preview plus importer; tablet reflow; mobile stacked slot/source controls with touch-safe picker | artwork absent/present, active/rewind preview, cover/sleeve/label slots, upload/drop, URL source, dirty/pending, cancel/apply | **Partial.** Production Artist Assets uses real completed-template/component data and a shared Canon importer. File upload is real. Completed-art URL import remains intentionally unavailable because no secure production URL-mirroring write path exists; confirmation stays disabled rather than fabricating a mutation. | No direct screenshot. The light Sell screenshot may contain the shared builder but does not prove every artwork slot/import state. |
| `mockups/OtisTracksInteractive.tsx` — release Tracks editor/player | `/artist/albums/:id?tab=assets` → `ArtistRelease` with the existing Tracks mount and shared exports from `AdminAlbum`; operator equivalent at `/admin/albums/:id` | Artist; super admin | Light + charcoal | Full editor/dock on desktop; responsive tablet; mobile controls retain touch targets and do not duplicate the track mount | edit/list modes, playable/no-master, selected/expanded track, play/pause, upload/progress/error, metadata/lyrics/credits, advanced controls, read-only/locked | **Built-unverified / partial state coverage.** The recovered Artist Assets flow preserves a single authoritative Tracks mount and existing production tooling. Repository notes explicitly say the full importer, preflight, undo/reset, lock, role, viewport, and theme combinations were not fixture-verified. | None. |
| `mockups/GoodDeedArtistPreview.tsx` — artist GoodDeed preview (print/social/texting) | Informational GoodDeed entry in `/artist/albums/:id?tab=assets` → `ArtistRelease`; actual fan export renderer remains `GoodDeedCertificate`; OG rendering remains server-owned | Artist preview; production fan certificate/export downstream | Portal chrome light + charcoal; certificate canvas uses its approved orange/navy/white media colors | Preview scales within desktop/tablet/mobile; exported media retain native Square 1080×1080, Portrait 1080×1350, Story 1080×1920, OG 1200×840; print remains Letter/A4 | print/social/texting selection, Letter/A4, signed/unsigned, Square/Portrait/Story; real owner/assets at export | **Differently delivered.** Production intentionally does not use the mock's sample owner/number or a new artist editor. Artist Assets names the unchanged production renderer as authoritative. Production-rendered actuals are included in the handoff as comparison assets, but are not route screenshots or a Canon receipt. The mock's “safe” overlay is not shipped because no platform/date-specific safe-zone authority was supplied. | No checked-in development route screenshot. Manifest PNG renders are output assets, not screenshots of the current route. |
| `mockups/ArtistTemplateTest.tsx` — Artist Test/Certify | `/artist/albums/:id/art-test/:componentId` → `ArtistDashboard` → embedded production `ArtistTemplateTest` | Artist/label authority-scoped; super-admin continuity through existing release access | Light + charcoal shell; proof sheet explicitly white in both | Desktop bounded proof workspace; 1024/768 no overflow; phone stacks toolbar/viewer while retaining controls | loading, unavailable/no art, raw art, checked art, passed/flagged/unverified/advisory, history, upload/replace, template visibility and remembered 55% opacity, art opacity, overlays, zoom/pan/crop/reset, certification, read-only/locked | **Built-unverified and blocked end-to-end.** Theme and proof-order corrections are in production code. Artist multi-page parsing remains explicitly deferred. Press-only download actions are absent. Development has no completed-art control row, so an end-to-end persisted receipt was not fabricated. | None. `docs/STATUS.md` explicitly records that no Artist Test/Certify screenshot was fabricated. |
| `mockups/PressTemplatesIndex.tsx` — Press Templates index | `/vendor?tab=templates` → `VendorPortal`/press portal → `PressTemplatesTab` → `PressTemplatesIndex` | Press owner/staff, permission-gated | Light + charcoal | Press rail and cover-first grid at 1440; usable grid/reflow at 1024/768; phone stacks filters/tiles/actions | loading/error, format/filter selection, current/archived, empty archived, filled/empty/pending/failed slots, add/upload, replace, archive/restore, history, permission-reduced/read-only | **Built-unverified.** Real APIs, archive/restore, replacement, file fetch and permission behavior are wired. This index was the baseline isolated for the R&D upgrade, not itself the newly authorized functionality change. | None. |
| `mockups/PressTemplateLiveTest.tsx` plus `experiments/press-template-test/PressTemplateLiveTestRndOwned.tsx` — Press Test/Certify, ordered multi-page proof | `/vendor?tab=templates&template=<specId>` for saved Canon, or the index's Upload flow into `PressTemplateLiveTest` | Press owner/staff with `canEdit` gating | Light + charcoal shell; white proof substrate; partner logos stay on white | Full rail/workspace at 1440; complete no-overflow workflow at 1024/768; phone must stack without dropping page rail, verdicts, or controls | template-only, artwork-only, artwork+template at retained 55% multiply; ordered pages/current page; per-page and aggregate verdicts; measuring/pending/pass/fail/error; page thumbnails; zoom/pan/crop/reset; overlays; upload/replace; draft recovery; save/history/certify; permission-reduced; stale/forged/unsupported evidence fail closed | **Development-verified acceptance fixture; production/Canon gate blocked.** The exact checked-in template and artwork fixtures were opened through the real Memphis press index flow without saving or certifying. All four ordered pairs passed in light and dark. Template-only, artwork-only, and artwork+Template at verified 55% were captured at all three widths with no document-width overflow. Draft recovery, persistence/history, reduced permissions, failure states, and production remain outside this visual receipt. The contradictory duplicate manifest records also remain an acceptance blocker. | `screenshots/canon-reconciliation-2026-09-04/press-template-{template-only,artwork-only,combined-55}-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png` (eighteen files). |
| `experiments/press-template-test/PressTemplatesIndexRndOwned.tsx` — R&D-owned index snapshot | Same `/vendor?tab=templates` production index; no independent route or production component | Press R&D provenance only | Light + charcoal in snapshot | Same as Press Templates index | Same index states; serves as isolated launch surface for the experiment | **Differently delivered / no separate implementation required.** `isolation.json` identifies this as an R&D-owned snapshot of `mockups/PressTemplatesIndex.tsx`, pinned to the Otis-applied baseline. It must not be counted as a second shipped surface. | None. |

## Manifest completeness

All TSX entries in `MANIFEST.json` are accounted for above:

1. `AdminArtistProfileInteractionCanon.tsx`
2. `ArtistDashboardAccountStack.tsx`
3. `ArtistDashboardNextSteps.tsx`
4. `ArtistReleasePackageTemplates.tsx`
5. `ArtistTemplateTest.tsx`
6. `GoodDeedArtistPreview.tsx`
7. `OtisTracksInteractive.tsx`
8. `VinylPackageArtwork.tsx`
9. `PressTemplatesIndex.tsx`
10. `PressTemplateLiveTest.tsx`
11. `PressTemplatesIndexRndOwned.tsx` — duplicate surface, R&D-owned snapshot
12. `PressTemplateLiveTestRndOwned.tsx` — same Press Test/Certify surface,
    authorized behavior source

Assets, fixture PDFs, and production-rendered GoodDeed PNGs in the manifest are
inputs or comparison artifacts, not routes. They are therefore not inflated
into additional “surfaces.”

## Evidence register and gaps

The current task-specific development screenshot evidence is:

- six Admin Artist Profile Settings captures:
  `admin-artist-profile-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png`;
- six Admin Album Package captures:
  `admin-album-package-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png`;
- six Admin Album Physical → Art captures:
  `admin-album-physical-art-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png`;
- eighteen Press Template Test captures:
  `press-template-{template-only,artwork-only,combined-55}-{light,dark}-{desktop-1440,tablet-1024,mobile-768}.png`.

All thirty-six files are under
`screenshots/canon-reconciliation-2026-09-04/`. Headless measurements confirmed
`documentElement.scrollWidth === clientWidth` for every capture. The Press
fixture was the exact four-page template/artwork pair named by the package
README; all four ordered pairs passed in both appearances, and the combined
captures verified a 55% Template opacity before capture. Nothing was saved,
certified, published, or changed in production to manufacture this evidence.

The Hellbender preview screenshots belong to a separate public,
presentation-only handoff and do not prove these routes. The GoodDeed PNGs in
the package prove renderer output dimensions/content for comparison, not route
layout, interaction, auth, permission, responsive behavior, or production
publication.

Consequently, none of the ten distinct surfaces has a complete current
production-acceptance receipt. The Admin Artist Profile has a verified
development Settings slice, not every profile tab/action/state. The Package
and Physical captures prove the shared workspace shell and real production
bodies, not every builder or fulfillment state. The Press fixture proves the
three required compositing states and four-page pass in development, not
save/history/certification/permission failure paths or production. Every claim
above remains deliberately limited to its named evidence.

## Task 3474 first-batch route/state/theme/viewport receipt

| Surface | Real route/state | Production body preserved | Light 1440 / 1024 / 768 | Charcoal 1440 / 1024 / 768 | Remaining visual-review boundary |
|---|---|---|---|---|---|
| Operator album Package | `/admin/albums/album-1?tab=sell` | `PressAlbumPackageBuilder` inside `AlbumWorkspacePanel`; pricing, saves, estimates, permissions, press selection and actions unchanged | **Captured 3/3; no document overflow** | **Captured 3/3; no document overflow** | Deep builder state combinations and artist-scoped release route |
| Operator album Physical → Art | `/admin/albums/album-1?tab=press&ptab=art` | `PressPanel` completed-art body with canonical Audio / Art / Fulfillment navigation; press-only Downloads waits for resolved role authority, survives valid press refreshes, and canonicalizes non-press links to Audio | **Captured 3/3; no document overflow** | **Captured 3/3; no document overflow** | Populated completed-art, validation, download and reduced-permission states |
| Album primary tab navigation | Same routes above | Existing tab visibility, URL, duplicate/delete and anchor behavior; explicit previous/next controls wrap the horizontal tablist without hiding tabs; selected-only tab stop plus Arrow/Home/End roving focus | **Captured at all 3 widths** | **Captured at all 3 widths** | Bill/Ruby visual approval |
| Admin Artist Profile Settings | `/admin/people/c5e0302d-570f-4709-8f01-b534047d9989?tab=settings` | `AdminPerson` plus registry-driven `ArtistTabBody` and real Ava Marlowe data | **Captured 3/3; no document overflow** | **Captured 3/3; no document overflow** | Other tabs, dialogs, integration states and reduced permissions |
| Press Test/Certify acceptance fixture | Memphis press Templates index → Upload → live test; exact four-page README fixtures | `PressTemplateLiveTest`, real PDF parsing and analysis; no save/certify mutation | **Template-only, artwork-only, combined-55 captured 9/9** | **Template-only, artwork-only, combined-55 captured 9/9** | Saved/history/draft recovery, failures, reduced permissions and production |

## Complete 68-row MRP disposition control

This table makes every row from
`docs/mrp-ask-reconciliation-2026-09-04.md` explicit in the Canon packet. It
does **not** promote a row based on adjacent shell screenshots: the source
status remains controlling until that row receives its own functional and
production receipt.

| Source row | Outcome | Production surface/control | Required runtime state | Theme / viewport control | September 4 disposition |
|---|---|---|---|---|---|
| SOW 1 | Landing choice: Short Run vs. Standard | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 2–3 | Short Run constrained mode and locks (12", 140g, Black/Eco, CMYK label) | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 4 | Per-insert/download-card assembly touch fee | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 5 | Free quantity 100–5,000, steps of 100, round-up and steppers | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 6 | One scrollable form with prerequisite gating | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 7 | Single LP / Double LP | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 8 | 7"/10"/12" with format-forced weights | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 9 | DMM / MRP-cut lacquer / customer lacquer selector | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 10 | Static “5 test pressings” text | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 11 | Format-dependent color/effect image grid | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 12 | Splatter add-on conditional on base color | Staff estimate builder / customer estimate viewer | Intentional production semantic/IA adaptation | Light + charcoal; 1440/1024/768 when a production surface exists | **Delivered differently.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 13 | Labels: Blank / Black Flood / B&W / CMYK | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 14 | Format-dependent inner-sleeve stocks | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 15 | Jackets by project type and format | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 16 | Printed insert plus 100# board upgrade | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 17 | 10"/12" 8/12-page booklets | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 18 | Download-card choices | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 19 | Download-card hosting | Fan digital delivery (different contract) | Intentional production semantic/IA adaptation | Fan contract, not operator Canon theme | **Delivered differently.** No new row-specific production receipt; source-row status unchanged. |
| SOW 20 | Matte AQ / Gloss UV and barcode generation | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 21 | Up to two stickers; color → stock → shape | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 22 | UPC sticker, two sizes | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| SOW 23 | Selectable shrink/poly/PVC outerwrap | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 24 | Auto-generated assembly bullets | Staff estimate builder / customer estimate viewer | Intentional production semantic/IA adaptation | Light + charcoal; 1440/1024/768 when a production surface exists | **Delivered differently.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 25 | Continuously visible total and unit price | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 26 | Final quantity / unit / total breakdown | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 27 | Next-price-break display | Staff estimate builder / customer estimate viewer | Intentional production semantic/IA adaptation | Light + charcoal; 1440/1024/768 when a production surface exists | **Delivered differently.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 28 | CODA ERP API pricing plus spreadsheet fallback | Press data controls / sync / export | Built runtime; production acceptance pending | Inherited UI where present; row is primarily data/configuration controlled | **Built — publish/production verification pending.** No new row-specific production receipt; source-row status unchanged. |
| SOW 29 | Public, customer-initiated RFQ | Public estimator (no complete anonymous create route) | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 30–31 | Emails to CS and submitter, with PDF | Estimate delivery / `/e/:token` | Intentional production semantic/IA adaptation | Light + charcoal; 1440/1024/768 when a production surface exists | **Delivered differently.** No new row-specific production receipt; source-row status unchanged. |
| SOW 32 | Backend and unique submission ID | Estimate delivery / `/e/:token` | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** No new row-specific production receipt; source-row status unchanged. |
| SOW 33 | Live record + label + jacket mockup | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 34 | Color photos and variant choice update mockup | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| SOW 35–36 | Label and jacket artwork uploads on mockup | Physical → Art / Press Templates | Intentional production semantic/IA adaptation | Light + charcoal; 1440/1024/768 proof workspace when visual | **Delivered differently.** Four-page Press proof evidence is supportive only; source-row status unchanged. |
| SOW 37 | Mockup in email and PDF | Estimate delivery / `/e/:token` | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** No new row-specific production receipt; source-row status unchanged. |
| SOW 38–39 | WordPress embed/responsive experience and test/UAT instance | White-label host / estimate viewer | Existing subset plus named missing behavior | Skin-specific host; responsive receipt still row-specific | **Partial.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 1.1–1.2 | Anonymous estimating; account only for save/PDF/mockup; full-library account prompt | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 1.3, 1.5 | Mobile-first single page, sticky price, revised order (quantity first) | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 1.4 | Curate public generator to the common 80%; full library in back end | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 1.6–1.8, 6.1–6.4 | Packages first; 100/200/300 constraints; custom build/quantity; turnaround copy; no short-run multi-LP | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 1.9 | End-of-flow “Anything you did not see?” field | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 1.11 | Public domain/DNS handoff | White-label host / estimate viewer | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 2.1–2.4, 2.6 | Public vinyl taxonomy, Black simplification, Solid ordering, 12"-only weight, blend dropdown | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 2.7–2.8 | Prominent customer color search and shopping-style filters | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 2.9 | Blend component-color search metadata | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 2.11 | Permit type-level pricing before a specific color; prompt color for mockup | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 2.13–2.19 | Recipe-driven effects: three-color splatter, top combos, color-in-color, half/A-B, Cloudy, Galaxy, hide public three-color A/B | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 2.20–2.22, 2.25 | Preserve photo plus generator, label-off imagery, logo alignment, image-first color creation | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 2.26–2.27 | Bulk price editing and correctly scoped surcharge edits | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 3.1–3.4, 3.6–3.10, 4.1–4.3 | Final public/back-end labels, jacket, sleeve, insert and download-card matrices | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 3.5, 4.6 | Fourth jacket finish and sticker nine-grid | MRP configuration over component/catalog machinery | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 3.11 | Per-press editable customer-facing versus internal labels | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 4.4–4.8 | One public promo sticker; quarter-inch sizing/square-inch price; real-size mockup; UPC at conversion | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 4.9–4.12 | Required outerwrap, bag/PVC rules and insertion price, picture-disc package | Staff estimate builder / customer estimate viewer | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 5.1–5.4 | Public mastering reduced to two choices; own-lacquer processing; fixed test-press/shipping defaults | Public estimator (no complete anonymous create route) | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 5.6–5.9, 15.4–15.5, 16.1–16.4 | One assembly line plus touches; sticker application; stamper/color/press setup; 37¢ open-top bag | Staff estimate builder / customer estimate viewer | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 when a production surface exists | **Built — publish/production verification pending.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 7.4, 7.6 | Configure minimum-text check; test against real failed files | Physical → Art / Press Templates | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** Four-page Press proof evidence is supportive only; source-row status unchanged. |
| Tracker 7.7, 7.9, 7.11 | Cropped guide-free proof, tracked download, history, drag/drop jacket composition | Physical → Art / Press Templates | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 proof workspace when visual | **Partial.** Four-page Press proof evidence is supportive only; source-row status unchanged. |
| Tracker 7.8 | Generate package orientation guide (POG) | Physical → Art / Press Templates | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 proof workspace when visual | **Outstanding.** Four-page Press proof evidence is supportive only; source-row status unchanged. |
| Tracker 8.3–8.5 | Warn rather than block over-length; 33/45 selector/recommendations; MRP limits | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 9.3–9.4 | Prospects bucket and anonymous usage/location/count analytics | Press operations / no complete route | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 9.5–9.8 | Estimate duplication/versioning, reference scheme, release umbrella, Create navigation/send placement | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 9.9–9.10 | Better no-art placeholder and more visible center label | Staff estimate builder / customer estimate viewer | Existing subset plus named missing behavior | Light + charcoal; 1440/1024/768 when a production surface exists | **Partial.** Album Package shell evidence is supportive only; source-row status unchanged. |
| Tracker 10.1–10.6, 14.1–14.6 | MRP/SO identifiers, catalog/matrix/version model, customer terms and UPC/version guidance | Press data controls / sync / export | Built runtime; production acceptance pending | Inherited UI where present; row is primarily data/configuration controlled | **Built — publish/production verification pending.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 10.8–10.9, 13.1–13.2, 13.5, 15.1–15.8 | Phase-1 formatted handoff; later ERP pricing/order API and code map | Press data controls / sync / export | Built runtime; production acceptance pending | Inherited UI where present; row is primarily data/configuration controlled | **Built — publish/production verification pending.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 10.12–10.13, 17.1–17.5, 19.1–19.3 | Operational dashboards, prior-title reorder, demand parking lot, timelines, rep routing/permissions | Press operations / no complete route | No authoritative complete runtime evidenced | Light + charcoal; 1440/1024/768 when a production surface exists | **Outstanding.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 13.3–13.4 | Store raw Coda description plus parsed fields; export official confirmed-order BOM | Press data controls / sync / export | No authoritative complete runtime evidenced | Inherited UI where present; row is primarily data/configuration controlled | **Outstanding.** No new row-specific production receipt; source-row status unchanged. |
| Tracker 18.1–18.2 | Missing-font and point-size implementation | Physical → Art / Press Templates | Built runtime; production acceptance pending | Light + charcoal; 1440/1024/768 proof workspace when visual | **Built — publish/production verification pending.** Four-page Press proof evidence is supportive only; source-row status unchanged. |
| Tracker 11.1–11.12, 13.5–13.6, 15.2, 15.6, 20.1–20.7 | Consolidated MRP data/asset/integration handoff | Press data controls / sync / export | Owner input/configuration required; no invented value | Inherited UI where present; row is primarily data/configuration controlled | **MRP configuration/input needed.** No new row-specific production receipt; source-row status unchanged. |

**Count control:** 15 built pending production verification; 14
MRP-input/configuration blocked; 19 partial; 6 differently delivered; 14
outstanding; 0 production-live; **68 total**.

## Preserved MRP input/configuration blockers — exactly 14

Task 3474 must not turn missing MRP decisions or assets into invented defaults.
The following fourteen rows are preserved exactly as the current
MRP-reconciliation control set. They remain **Blocked — MRP
configuration/input needed**, irrespective of how much supporting UI machinery
already exists.

| Control | MRP-owned input/configuration still required | Status |
|---|---|---|
| SOW 8 | Confirm/load format-forced weights, including 49g/110g behavior | **Blocked — MRP input/configuration** |
| SOW 13 | Confirm final label families, exact Black Flood naming, and catalog rows | **Blocked — MRP input/configuration** |
| SOW 14 | Approve final format-dependent inner-sleeve stock visibility/matrix | **Blocked — MRP input/configuration** |
| SOW 15 | Complete public jacket types/rules, including trifold and 7-inch double-LP interpretation | **Blocked — MRP input/configuration** |
| SOW 16 | Supply/load the gloss, uncoated paper, and 100# board insert matrix | **Blocked — MRP input/configuration** |
| SOW 17 | Supply exact 10/12-inch booklet page-count rows | **Blocked — MRP input/configuration** |
| SOW 22 | Load and confirm the two UPC sticker sizes | **Blocked — MRP input/configuration** |
| Tracker 1.4 | Approve the final public “common 80%” generator subset | **Blocked — MRP input/configuration** |
| Tracker 1.11 | Provide MRP-owned DNS and complete manual host activation for the public domain | **Blocked — MRP input/configuration** |
| Tracker 2.9 | Supply the blend component-color grid/search metadata | **Blocked — MRP input/configuration** |
| Tracker 3.1–3.4, 3.6–3.10, 4.1–4.3 | Supply final public/back-end label, jacket, sleeve, insert, download-card matrices, dependencies, wording, and visibility | **Blocked — MRP input/configuration** |
| Tracker 3.5, 4.6 | Supply the fourth jacket finish and sticker nine-grid | **Blocked — MRP input/configuration** |
| Tracker 7.4, 7.6 | Set the minimum-text threshold and provide real failed art files for validation | **Blocked — MRP input/configuration** |
| Tracker 11.1–11.12, 13.5–13.6, 15.2, 15.6, 20.1–20.7 | Complete the consolidated BOM/placement, recipes/hard-no combinations, imagery, assembly/lacquer/side/prepress rules, Coda/version exports, pricing/code/API materials, DNS, broker change, dashboard notes, and owner/contact handoff | **Blocked — MRP input/configuration** |

These fourteen rows are configuration/input blockers, not evidence that their
underlying component, catalog, proofing, or host machinery is absent. Conversely,
the presence of that machinery is not evidence that MRP supplied or accepted
the missing values.

## Canon decision

**Current task result: READY_FOR_VISUAL_REVIEW — not READY_FOR_CANON.**

The assigned development batch and its required screenshot matrix are complete
enough for Bill/Ruby visual review. The promotion gate is still not met
because:

1. corrected code has no dated published-production verification;
2. the Admin Artist Profile receipt covers the Settings slice, not every
   profile tab/action/state;
3. the Press ordered multi-page receipt covers the exact unsaved acceptance
   fixture and its three required compositing states, not saved/history/draft,
   failure, permission-reduced, or production behavior;
4. development has no authoritative completed-art control row for a persisted
   Artist Test/Certify receipt;
5. the manifest contains conflicting records for the template fixture; and
6. the fourteen MRP-owned configuration/input rows above remain blocked and
   must not be guessed.

Do not publish from this result. Visual approval is the next gate. Promotion
still requires an itemized Otis receipt reconciled against independently
verified published behavior. Repository code, passing tests, development
screenshots, mocks, and source assets may support that receipt, but cannot
substitute for it.