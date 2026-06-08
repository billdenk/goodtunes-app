---
name: Person sheet bio strip + gear list
description: Three-layer Apple-Music boilerplate-bio defense and how the fan Person sheet surfaces unlinked instrument credits.
---

# Apple-Music boilerplate bio defense is three layers, on purpose

Scraped bios used to capture Apple's "Listen to music by … on Apple Music."
sentence. It is killed in THREE places that must stay in sync:
1. **Import** — `stripAppleMusicBoilerplate()` in `server/routes.ts` runs inside
   `cleanBioText` AND wraps every scrape `og:description` block (person, vendor,
   manufacturer, fulfillment, label, manager). New scrape paths must wrap too.
2. **One-time backfill** — marker `task_1710_strip_apple_bio` in
   `post_merge_data_backfills` (post-merge.sh), nulls/strips existing rows in
   `people.bio`, `vendors.bio`, `labels.bio` on dev AND prod.
3. **Render guard** — exported `stripAppleMusicBoilerplate` in AlbumDetail.tsx
   defends the fan sheet (`const bio = strip(...) || null`) and gates
   `personProfileIsRich` (a boilerplate-only bio must NOT count as rich).

**Why:** import-only would leave historical rows dirty; backfill-only would let
the next scrape re-introduce it; render-only would leak into other consumers and
into richness checks. Don't collapse to one layer.

# Person sheet "Gear" list surfaces unlinked instrument credits

The fan Person sheet gear list (AlbumDetail.tsx, `PerformerProfileContent`)
shows BOTH linked instruments (tappable → gear page, `tappable:true`) and
*unlinked* instrument credits — a named role like "Pedal Steel" with no linked
Instrument — as a plain non-tappable row (`text-performer-gear-<id>` vs
`button-performer-gear-<id>`), keyed `role:<lower>`, category inferred via
`shortCategoryForRole` (fallback "Instrument"). Vocals and
production/engineering credits are excluded via `roleIsInstrumentCredit` (regex
denylist) — that same helper also makes `personProfileIsRich` count an
instrument credit so the person stays tappable. Linked rows sort first.

# SheetClose default is glass, not fill (don't revert)

`SheetClose` in `client/src/components/ui/SheetChrome.tsx` defaults to
`variant="glass"` (muted, matches `SheetBack`), NOT the old opaque-gray `fill`.
`docs/design-system.md` was reconciled to match. Callers may still pass
`variant="fill"` for rare high-contrast cases. Don't "fix" it back to fill.
