---
name: Press mode god-view (Dedicated vs All Presses)
description: How the super-admin per-entity press_mode toggle resolves and what it gates; the stamp→album re-resolve rule and the package-designer hidden-vendor trap.
---

# Press mode god-view (Dedicated vs All Presses)

A super-admin-only control on artist (People) and label detail pages that decides
whether an album's Sell panel locks to a single resolved plant ("dedicated") or
opens the press picker + side-by-side multi-bid comparison ("all").

## Resolution rule
- `press_mode` column lives on BOTH `people` and `labels` (`text`, nullable).
  `null` = inherit.
- Resolve **artist → label → "dedicated"**: a non-null artist value
  short-circuits; otherwise fall to the label; otherwise default "dedicated".
- This mirrors press resolution BUT is **independent of the `invitedByPressId`
  stamp** — an unaffiliated artist (no invited press) can still be set to "all".
- The toggle always persists a non-null value, so an artist's explicit choice
  wins over its label's.

**Why:** the operator wants to open up a single act to cross-press bidding without
unlocking the whole label roster, and wants to shop presses even for artists who
were never press-invited.

## What it gates (client)
- Resolved mode rides on the existing `/api/admin/albums/:id/invited-press`
  response as `pressMode` (added to every return branch). SellPanel reads it from
  that one query — no extra fetch.
- "all" lifts the invited-press hard lock in the Printer/press panel and is the
  ONLY thing that shows the cross-press Quotes comparison section. "dedicated"
  (or absent) keeps the panel locked to the single plant with no comparison.

## Stamp → album re-resolve (the important bug fix)
Correcting an album's governing press stamp (`setInvitedByPress`) MUST flow
through to already-saved SKUs: re-resolve every unlocked catalog SKU snapshot of
every album under that scope against the album's freshly-resolved press, so a
stale press's pricing stops showing without a manual re-save.

**How to apply:** only touch rows `cost_source='catalog' AND locked_at IS NULL AND
deleted_at IS NULL` (at-press/locked runs keep committed numbers). Re-resolve each
album's press fresh (artist→label) so artist-wins precedence holds even when only
the label changed. Resolve tier by NAME in `press_color_tiers`, color by NAME in
`press_colors` (tier_id), price via `lookupCatalogUnitCents`, apply
`brokerDiscountPct` into the discounted snapshot column. Model the resolve logic
on `scripts/backfill-sellpanel-stale-snapshots.ts`.

## Package-designer hidden-vendor trap
`PressPanel` defaults the package-designer vendor from the album's resolved press
via `matchInvitedPressToVendor`. The original code only honored the match if the
vendor was NOT in `HIDDEN_PREFLIGHT_VENDORS` — so a Hellbender-stamped album
silently fell back to MRP, because Hellbender is hidden from generic preflight.

**Fix:** a deliberate per-album stamp must win — honor the matched vendor EVEN IF
hidden, and inject that matched-hidden vendor into the `<select>` options so the
default is actually selectable. The hide list only governs *generic* pre-meeting
defaults, never a resolved stamp.
