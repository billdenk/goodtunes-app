# Playground Handoff — Project Structure Flows

**Date:** August 10, 2026
**Audience:** Playground (mock flows only — nothing here merges or ships from Playground).
**Supersedes:** the 2026-08-09 Project/Structure brief's design guidance. The hierarchy and decisions in that brief stand; its design advice does not.

## Design authority (read this, ignore everything else about visuals)

- The UI/UX canon is **already established and already has both light and dark variants**. Playground must not improvise palettes, radii, or control sizes — pull them from the app it already renders against.
- Canonical sources in this repo: `docs/apple-canon.md` and `docs/design-system.md`. Non-negotiables that mocks routinely break:
  - **One filled blue pill per screen** (the single primary CTA). All other actions are quiet borderless text buttons.
  - **Status pills are dot + label, never color-only.**
  - Admin density: h-8/h-9 controls, ~6px corners, white cards with hairline borders, no drop shadows at rest.
  - Segmented controls: gray pill track with a raised white thumb.
- Any prior brief text describing colors, radii, or control sizes is void. When in doubt, match the existing admin screens pixel-for-pixel.

## The hierarchy (unchanged, locked)

**PROJECT** (top container; an album is one project; a project can hold multiple releases)
→ **Assets** (shared: audio, artwork — uploaded once, used everywhere)
→ **Formats** (Vinyl / Digital / CD / Cassette; digital-only projects are valid)
→ **Variants** (same content, different manufacturing spec; each carries its own press run, quote, quantity, payments; GoodDeed numbering and status pills attach here)
→ **Inventory** (source: GoodTunes press run or external intake → fulfillment node → allocation pools)
→ **Sales channels** (three axes: where sold / who manufactured / who fulfills)

Locked decisions (do not re-litigate in mocks): GoodDeed numbering per variant; status pills at variant level; manufacturing payments/quotes attach to the press run; digital entitlements/comps attach to the project; orders attach to the channel and draw against an allocation pool; locks are per-asset and per-format; every existing album migrates as 1 project / 1 format / 1 variant / 1 channel; open estimates snapshot prices ("pricing changed, refresh" — never silent mutation).

## The flows (named — we walk them one at a time, in this order)

| # | Flow | Status |
|---|------|--------|
| 1 | **Project flow** — Artist > New Project > Formats > Variants | **START HERE.** Already begun with Playground; continue from the existing flow. |
| 2 | **Evergreen flow** — inventory pools, velocity alerts, repress | **Priority — Raynes needs a solution this week.** Pull forward anything from Flow 3/4 it needs (pool counts, node abstraction) as stubs. |
| 3 | **Inventory intake flow** — external stock in: node selection, expected vs. received, condition check, allocation pools, ready-to-sell | New. |
| 4 | **Sales-channel flow** — the three axes as four preset patterns (Full GoodTunes Direct / GoodTunes presses+fulfills + artist Shopify sells / fulfillment-only / Digital + Signed GoodDeed), "Custom" as escape hatch | New surface; two of the four patterns already work in the backend. |
| 5 | **Sunset flow** — dedicated-page outcomes (Sold out vs. trailing fulfillment with Signed GoodDeed cutoff), Evergreen conversion at sunset | New. |
| 6 | **Digital exclusives flow** — asset flag in the project + the resulting player section | New. |
| 7 | **Migration view** — what an existing single-album artist sees the morning after (their album as a project, nothing renamed underneath them) | New; cheap to mock, highest-risk screen. |

Component-based pricing / the estimate engine is **already built with Playground** (needs tweaks, not redesign) — quotes attach at the variant level, which Flow 1 must leave a clean slot for. Don't draw pricing screens in this pass.

## Flow 1 spec — Project flow (current focus)

Artist > **New Project** > Formats > Variants.

- **New Project:** name, artist, artwork slot (upload once — we verify, assemble into the assigned press's templates, return for approval; artist never touches templates), audio slot (masters + treatments: streaming, mastering, lyrics sync, splits, SuperCredits).
- **Formats:** add one or more of Vinyl / Digital / CD / Cassette. Digital-only is valid. Vinyl keeps the current side-break behavior (system-determined, artist-adjustable). Digital keeps current 30-second preview windows (auto or artist-selected), track order, streaming links. CD/Cassette: the press-side catalogs exist; the artist-side format setup is new.
- **Variants:** within a format — vinyl color today, packaging later. Each variant shows its own status pill (dot + label), quantity, press run/quote slot, and GoodDeed certificate sequence. Adding a variant never touches shared assets (track order, artwork, previews are edited once, inherited everywhere).
- **UPC open question:** mock per-format and per-variant as one screen with a toggle, so the tradeoff is visible in a single walk.

## Flow 2 spec — Evergreen (this week)

- **Inventory counts** live on allocation pools at a fulfillment node; the GoodTunes-fulfilled pool drives the public pill: In stock → Low stock → Sold out → At press.
- **Velocity alerts:** mock the surface, not the math — "at current pace, Low stock in ~3 weeks" on the variant; dot+label severity; one primary action.
- **Repress flow:** the alert's action opens a repress request against the same variant — pre-filled from the original press run (press, spec, last quantity) — producing a new press run + quote under the estimate-snapshot rule. Status flows back as "At press."
- **External-intake variants** get the same loop, but "repress" becomes an **intake request** (artist sends more stock) — same loop, different verb, no quote.
- Entry point: Evergreen conversion at sunset (Flow 5) — but don't block on Flow 5; mock Evergreen standalone first.

## Already built — Playground pulls from these, does not reinvent

**Live in the product today (mock as existing behavior, reuse the current UI):**
- Audio pipeline: streaming (Mux), synced lyrics, track/publishing splits, SuperCredits (performers + gear).
- Artwork: upload-once, press-template resolution (jacket/labels/sleeves from the assigned press), finished-print-file verification, vinyl side-break derivation with artist adjustment.
- Digital: 30-second per-song preview windows, streaming-link auto-resolution (Apple/Spotify/Tidal/Deezer/Pandora), pre-save + launch dates.
- Press catalogs: vinyl types/colors/run-price ladders per press, CD + cassette build pages, component pricing backend, artist package builder, estimate snapshots.
- Sales channels: Shopify patterns (b) and (c) already work — artist's-Shopify-sells with GoodTunes pressing+fulfilling, and fulfillment-only — including variant-pinned order mapping. Pattern (a) is today's default.
- Fulfillment: Order Desk (Spinney) live — push, status webhook, tracking ingestion. All artist/fan-facing surfaces are GoodTunes-branded end to end; node and connector names never appear.
- Sunrise/sunset primitives: prepping/staged state, reviewer preview links, per-track embargo, private player persisting for buyers forever.
- Custom add-ons exist in nav — Flow 1's variant add-ons (signed/numbered inserts) connect there.

**Greenfield (nothing exists — design freely within the hierarchy):**
- Project container + migration framing.
- Allocation pools, fulfillment-node abstraction, external intake, the entire Evergreen loop (inventory counts, velocity alerts, repress).
- The three-axis channel configuration as a single surface.
- Digital exclusives (asset flag + player section).
- UPC modeling.

## Context Playground should know (not mock)

- The component-pricing build demos to **MRP on 8/24**. A GoodTunes-internal "Press" is being added so the component builder can be turned on for it alone and demoed. After MRP: ERP integration, then onboarding other presses. Nothing in these mocks should conflict with that build — Flow 1's variant/quote slot is its attachment point.
- Signed GoodDeeds are window-bound and batch-signed — never inventory. Keep them out of pool counts everywhere.
- Sharing/referral always routes to the GoodTunes player and preview; only the buy button routes to a configured channel.
