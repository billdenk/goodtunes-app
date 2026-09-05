# GoodStudio → Otis final implementation package

Date: 2026-09-04
Source owner: GoodStudio
Receiving app: Otis (billdenk/goodtunes-app)

This package closes the current Artist Profile interaction and multi-page Template proofing review round. Otis must implement the two scopes below, publish them, verify production, and then report back with the itemized receipt at the end of this document. Do not promote anything to Canon from this package alone; the verified Otis receipt is the promotion gate.

## Authority and change boundary

### A. Admin Artist Profile

**PRESENTATION + INTERACTION REACHABILITY; NO NEW DATA CONTRACT.**

Replace the presentation on Otis' existing super-admin artist profile route and wire every listed interaction to the existing production handlers. Preserve all current routes, API contracts, database writes, permissions, validation, audit behavior, Shopify behavior, press assignment/referral meaning, releases, fulfillment, builders, pricing, estimates, white-label behavior, and production data. Restore existing Otis actions that became hidden by presentation changes; do not create new server behavior from the mock's local React state.

The GoodStudio source is the exact presentational and interaction contract. Wire Otis data and existing handlers into it. Replace every MOCK_ value with live data. Never ship demo identities, in-memory mutations, hash navigation, or mock timeouts. If an action shown by the source has no existing Otis capability, report it as blocked instead of inventing a new contract.

Required visible behavior:
- Preserve the real /admin/people/:id route and the real admin shell/auth gate.
- Identity, artist URL, bio, releases, links, notifications, Shopify, production press, referral source, view-as, audio, art, photos/videos, GoodDeed assets, and next-steps surfaces must use their existing authoritative Otis data/actions.
- Existing functionality that is merely hidden must become reachable again without semantic change.
- Press picker uses Otis' actual active press directory and real mode-safe logos; do not ship mock press records.
- Production press and referral source remain separate concepts and preserve existing history/audit rules.
- View-as remains read-only and permission-gated.
- The next-steps strip starts collapsed, stays sticky where the existing estimator chrome requires it, and its Expand affordance uses the approved gentle traveling edge/text shimmer with reduced-motion handling.
- Use the current artist's GoodDeed assets and current approved orange A4/US Letter materials; do not substitute older mock certificates.
- Any cover/player art must follow Otis' authoritative asset precedence and resolution rules; do not infer a new upload contract.

Must work:
- Every visible Edit, Add, Replace, Connect, Change, View-as, tab, chip, overflow menu, dialog, sheet, copy action, external link, retry, close, cancel, and confirm.
- Close/cancel never mutates.
- Confirm controls become earned/active only when Otis' existing validation says the action is valid.
- Loading, empty, error, permission-reduced, read-only, connected/disconnected, and success states.

Decorative only:
- None of the mock's local timers or local arrays are behavior contracts.

Acceptance:
- Screenshot the live route in both themes at 1440, 1024, and 768.
- Compare top-to-bottom with the supplied source after live-data substitution.
- Exercise every Must work item with real Otis handlers.
- Prove no request method/path/payload or permission result changed for pre-existing actions.

### B. Press Template Test — ordered multi-page proofing

This is an approved functionality upgrade, not a skin-only handoff. Keep the current Otis route, persistence, template records, draft recovery, history, certification, supersede behavior, permissions, shell, and API wiring. Port the supplied proof-engine behavior into the existing Otis page rather than replacing Otis' server integration with the R&D in-memory stores.

Required behavior:
- Pair template and artwork pages in exact order for the full document.
- Run the same analysis and verdict checks independently on every page.
- A failure on any page blocks the aggregate result; a passing current page can never hide a failing page elsewhere.
- Artwork renders first; Template renders frontmost.
- Template opacity defaults to 55% for a new template test.
- Template off/on preserves the selected opacity; uploading a new template resets it to 55%.
- With artwork present, Template uses multiply blending in the main viewer and every thumbnail. Template-only remains normal and fully legible.
- Page thumbnails mirror the main viewer: Template-only before artwork; artwork-only when Template is off; artwork plus Template at the current opacity when on.
- Preserve page selection, pass/fail markers, zoom, pan, crop, transforms, overlay controls, history, save, certification, and breadcrumb behavior.
- Effective PPI uses embedded raster pixels divided by painted physical size, never viewport or thumbnail size.
- Painted color-space evidence counts only assignments that actually paint fill, stroke, text, mask, or placed image. Exclude soft-mask images from artwork color-mode classification.
- Vector-only pages truthfully pass without a raster PPI floor.
- Optional-content hygiene checks inspect only groups referenced by page content; disabled/orphaned GT PREVIEW catalog records are acceptable.
- Preserve exact art/template geometry and never redraw or substitute the press source.

Must work:
- Ordered page navigation and current-page selection.
- Template visibility, opacity, layer/zone, line/area, zoom/pan, reset, upload/replace, save, history, and certification controls.
- All Otis draft, record, permission, and persistence behavior that already works.

Acceptance fixture:
- Template: test-fixtures/12-LBL100M-2_12in_Center_Labels_for_2LP_R091125.pdf
- Artwork: test-fixtures/CenterLabels_Finished.pdf
- Expected: four ordered pairs; main raster on every page is 1905 × 2223; every page is 300 × 300 effective PPI; painted raster content is CMYK; no painted RGB assignment; no page-referenced GT template layers remain in the artwork; aggregate pass.
- Verify Template-only, artwork-only, and artwork+Template at 55% for the main viewer and all four thumbnails.
- At 55%, artwork remains saturated while Template linework/text remains visible and its white page does not wash the art toward white.

## Explicitly deferred

Do not push the isolated multi-page Press R&D component directly into Artist proofing as a skin-only change. Artist multi-page parsing is a later separately authorized scope and must retain Artist-specific authority restrictions.

## Otis implementation and production gates

1. Start from the newest main and read docs/STATUS.md.
2. Apply the Artist Profile presentation over existing handlers with the presentation + interaction-reachability classification above. Every listed link and action must remain live.
3. Integrate the multi-page proof engine into Otis' existing wired Press page.
4. Run Otis' production build, design lint, focused static checks, and focused browser tests for these changed routes.
5. Publish Otis through its normal Replit publishing flow.
6. Verify the published routes, not only development.
7. Append the receipt below to docs/STATUS.md and push it.

## Required Otis receipt

Return one row per scope with:
- GoodStudio package commit SHA.
- Otis implementation commit SHA.
- Outcome: applied verbatim / applied with named data-wiring adaptations / superseded / rejected / blocked.
- Exact Otis routes and implementation files.
- Every Otis-authored difference from supplied presentation or behavior, with reason.
- Production URL and dated evidence for both themes and required widths.
- Build, lint, static-check, and browser-test results.
- Confirmation that builders, pricing, estimates, permissions, fulfillment, white-label behavior, and unrelated production routes are unchanged.
- Final status: READY_FOR_CANON or BLOCKED, with each blocker named.

Canon promotion is blocked until GoodStudio reconciles this receipt with independently verified production behavior.
