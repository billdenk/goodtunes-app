---
name: Person sheet bio strip + gear list
description: Three-layer Apple-Music boilerplate-bio defense and how the fan Person sheet surfaces unlinked instrument credits.
---

# Apple-Music boilerplate bio defense — one shared matcher, three+ layers

Scraped bios used to capture Apple's "Listen to music by … on Apple Music."
sentence. **The matcher is now ONE module: `shared/appleMusicBio.ts`
(`stripAppleMusicBoilerplate`)** — every layer imports it so they can't drift.

**NBSP root cause (why #1710/#2057 silently failed):** Apple serves the phrase
with a NON-BREAKING SPACE (U+00A0) between "Apple" and "Music" (so it never
line-wraps). The old regexes matched literal ASCII spaces, so they NEVER matched
those rows — every layer no-op'd. The shared matcher uses `\s+` between all words
(JS `\s` covers U+00A0, narrow-NBSP U+202F, thin, U+2028/9, U+205F, U+3000,
ZWNBSP…) and returns "" when no alnum survives. Any bio-strip regex you write
MUST be whitespace-tolerant, not ASCII-space.

Killed in the places that must stay in sync (all import the shared fn):
0. **Storage chokepoint (the hard one)** — `server/storage.ts` `createPerson` /
   `updatePerson` strip `bio` by default. This is REQUIRED, not optional: the
   partner pending-change approval replay (`applyPendingChange` in
   `server/auth/partnerPermissions.ts` → `storage.updatePerson(targetId, payload)`)
   bypasses every route-level strip, so route-only sanitizing leaves a live
   bypass. Route stripping stays as defense-in-depth; storage is the guarantee.
1. **Import** — `server/routes.ts` `cleanBioText` + every scrape og:description
   block; `server/pressPortal.ts` "add artist under press" raw-SQL insert.
2. **One-time backfill** — marker `task_2460_strip_apple_music_bios` in
   `post_merge_data_backfills` (post-merge.sh). SQL mirrors the JS: normalizes
   the Unicode space variants to ASCII first (pg `[[:space:]]`/`\s` is locale-
   dependent, don't trust it to match NBSP), then strips, then NULLs empty.
   Gated on a `has`-match so clean bios are never rewritten. (Old markers
   `task_1710_*`/#2057 are the dead ASCII-only attempts — don't reuse them.)
3. **Render guards** — AlbumDetail.tsx fan sheet (`strip(...) || null`) +
   `personProfileIsRich` gate; admin read-only headers AdminPerson.tsx (2 spots)
   + AdminManufacturer.tsx press summary. Label/Vendor/Manager admin bios are
   EditablePanel form fields (no read-only render), so the write-path strip
   covers them — nothing to guard there.

**Why:** import-only leaves historical rows dirty; backfill-only lets the next
scrape re-introduce it; render-only leaks into other consumers + richness checks.
Don't collapse to one layer, and don't fork the matcher.

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
