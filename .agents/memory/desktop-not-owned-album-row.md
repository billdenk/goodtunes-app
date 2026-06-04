---
name: Desktop not-owned album view — intentional omissions
description: Which controls are deliberately hidden on the desktop preview/buy (not-owned) album surface and why
---

# Desktop not-owned (preview/buy) album view — intentional omissions

On the desktop album surface (`DesktopAlbumView.tsx` + shared `AlbumDesktopTrackRow.tsx`),
the **not-owned / preview-and-buy** state deliberately strips chrome that only makes
sense once a fan owns the release. Do NOT "restore" these as if they were missing —
they were removed on Bill's explicit direction.

- **Buy pill** default label is `Buy Now`; the price (`Buy Bundle — $X`) is revealed
  only on hover/focus. Both labels share one CSS-grid cell (`grid justify-items-center`,
  `col-start-1 row-start-1`, visibility toggle) so the pill width is fixed to the wider
  (price) label and never reflows on hover.
- **Shuffle** is omitted from the not-owned transport row (owned row keeps it).
- **Album-level ⋯** ("More options") in the hero header was a dead button (no onClick)
  and is removed for everyone.
- **Per-track ⋯** menu is gated by `AlbumDesktopTrackRow`'s `showMenu` prop, passed
  `showMenu={isOwned}` — present on the owned library, hidden on preview/buy.
- **Locked tracks** show NO padlock glyph — the dimmed/disabled row styling alone
  conveys the locked state ("just disabled, no lock").

**Why:** the preview/buy surface should lead with Preview + Buy only; queue/playlist/
favorite actions and shuffle don't apply before purchase.
**How to apply:** scope additions to `isOwned` (or the row's `showMenu`) rather than
showing them unconditionally; keep the Buy pill's two-label grid so width stays stable.
