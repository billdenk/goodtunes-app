---
name: Hydration/snap effect pairs must gate on state, not refs
description: Same-commit React effect race where a "normalize selection" effect overwrites just-hydrated state; and the shared saved-color resolution rule for press package builders.
---

**Rule 1 — gate cross-effect ordering on STATE, never a ref.** A hydrate effect that flips `hydratedRef.current = true` synchronously and queues `setX(saved)` lets a LATER effect in the SAME commit see `hydratedRef` already true while its closure still holds the PRE-hydration `x`. If that effect "normalizes" x against a catalog/list, it queues its own `setX(fallback)` which lands after hydration's — last write wins, saved state silently replaced. Deterministic when all react-query caches are hot (user navigated from an index page). Fix: `const [hydrated, setHydrated] = useState(false)`; the sibling effect gates on the state, whose closure is still `false` during the hydration commit.

**Rule 2 — a hydration latch must wait for the target row.** Never mark hydration complete just because the list query has rows; if the target id is absent, wait while `isFetching` and only latch once the fetch has settled without it, or a stale cached list skips hydration forever.

**Rule 3 — editor and index card must share ONE saved-selection resolver.** Press package saved colors resolve id-first against the FULL catalog, then by saved NAME (catalog re-imports mint new ids for the same names — same reason SKUs snapshot colors by name). `resolveSavedSwatch` in PressPackageBuilder.tsx is that resolver (used by builder + Packages index). No match at all = show the saved snapshot with a "no longer offered" note — NEVER silently substitute the first catalog color. New saves write `payload.colorSnapshot` (top-level, builderState shape untouched); legacy rows fall back to the summary line ("140g clear red vinyl …") then the demo CATALOG_COLORS names for demo ids like BK1/SP2.

**How to apply:** any builder/editor that hydrates saved state and also has a "snap selection onto live data" effect; any saved-reference display that a live catalog might no longer contain.
