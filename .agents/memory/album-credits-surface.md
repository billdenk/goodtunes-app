---
name: Album credits surface (Apple-style grouped)
description: How the fan album-credits surface aggregates + when it shows; desktop vs mobile gating differs on purpose.
---

# Album credits surface

The fan album-credits surface (mobile `AlbumCreditsSheet` + desktop `AlbumCreditsPage`, both in `AlbumCreditsSheet.tsx`) renders Apple's three broad buckets, built by the shared `buildAlbumCreditGroups(payload)`:
- **Performing Artists** ← every song's `bySongId[*].performers`
- **Composition & Lyrics** ← every song's `bySongId[*].writers`
- **Production & Engineering** ← album-level `production`

Each person is deduped within a group; their distinct role strings are joined (first-seen order) into the **subtitle** under the name (e.g. "Vocals, Bass Guitar"). Empty groups are dropped. The credits endpoint is `GET /api/albums/:id/credits` (shape: `{ bySongId, production }`). Both surfaces take the **full payload** prop (`credits`), not flat rows.

## Gating is intentionally different desktop vs mobile
- **Desktop (`AlbumDetailDesktop.tsx`)**: credits are **owner-gated** ("show after someone buys", per Bill). Both the credits IconButton and the modal mount require `effectiveOwned && hasAnyCredits`.
- **Mobile (`AlbumDetail.tsx`)**: deliberately **NOT** owner-gated — it keeps the pre-purchase SuperCredits™ teaser (the SuperCredits badge opens the same sheet). Mobile open-gate uses aggregated `albumCreditGroups.length > 0` (not production-only).

**Why:** Bill asked credits to look like Apple and be shown "after someone buys"; that maps to the desktop modal. Mobile's SuperCredits teaser is a deliberate pre-purchase selling point and was preserved.

**How to apply:** changing the gate on one platform does NOT imply the other. If you ever unify gating, confirm with Bill first — the split is by design.

## One shared list↔person slider (Apple-style)
Both surfaces drive a single `CreditsSlider` that horizontally slides a tapped person's `PerformerProfileContent` in OVER the credits list (Apple push), back caret top-left, list keeps its own close. Container never resizes between views.
- **Mobile** `AlbumCreditsSheet`: `SheetShell variant="fixed"`, `showCloseOnPerson={false}` (X hidden on the person view — back caret only). Caller passes `resolvePersonContext(personId, role)` returning the contextual `CreditsPersonView` (real Person + lead-in song the person played on + otherTracks); null = unknown person.
- **Desktop** `AlbumCreditsPage` (renamed from `AlbumCreditsModal`): breathable full page (`fixed inset-0`, bg `var(--brand-bg)`, max-w-680 centered), `showCloseOnPerson` (persistent corner X), self-manages its exit fade via internal `open` + `AnimatePresence onExitComplete={onClose}` so call sites keep the plain `{cond && <AlbumCreditsPage/>}` mount. Opens person About-first (synthesized Person, no track context).

Rows: quiet dark pill cards (`bg-white/[0.04] rounded-2xl`), NO white hairlines. Trailing chevron `›` (text-fan-faint) renders ONLY on tappable rich-profile rows (gated by `personProfileIsRich`), nothing on dead rows — the chevron's presence IS the "more here" signal (approved by Bill). `usePersonGearDrilldown` overlay MUST render OUTSIDE the framer-transformed panel/page wrapper (its sub-sheets are position:fixed).

**Why:** Task #1547 — Apple dark pills + slide-in person view; killed the centered desktop modal box and the separate mobile PerformerSheet hop for album credits (per-track mobile "Song Credits" still uses the old PerformerSheet, intentionally out of scope).
