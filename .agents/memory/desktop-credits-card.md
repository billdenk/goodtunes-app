---
name: Desktop credits card (AlbumCreditsModal)
description: How the desktop/iPad Album+Song credits modal hosts an in-box person drill-down and gates dead-link people.
---
# Desktop credits card — in-box person drill-down

`AlbumCreditsModal` (client/src/components/ui/AlbumCreditsSheet.tsx) is the
desktop/iPad-only credits card (mobile uses the bottom-sheet `AlbumCreditsSheet`).
It hosts the person view INLINE rather than closing + popping a separate sheet.

- Person view + gear stack come from AlbumDetail.tsx exports:
  `PerformerProfileContent`, `usePersonGearDrilldown(onCloseAll)`,
  `resolveStaticInstrument`, `personProfileIsRich`. The hook's `overlay` must be
  rendered as a TOP-LEVEL SIBLING outside the framer-transformed card (a
  transformed ancestor breaks the overlay's position:fixed — same root cause as
  the framer/transform memo).
- Dead-link gating is desktop-modal-only (mobile sheet stays always-tappable):
  a per-row child runs `useQuery(["/api/people", personId, "profile"])` and shows
  a plain non-tappable row until `personProfileIsRich` (bio || any instrumentId ||
  a track on another album). **That query key is the SAME one
  PerformerProfileContent uses**, so gating pre-warms the in-box person view —
  opening a rich person is instant. Don't change one key without the other.
- AlbumCreditsSheet.tsx ↔ AlbumDetail.tsx is a deliberate circular import (the
  modal pulls SheetShell/PerformerProfileContent/etc. from AlbumDetail). Runtime
  ESM handles it; HMR just force-reloads the page ("circular import" info log) —
  not a bug.
- design-lint baseline is keyed on (rule, file, trimmed-snippet): editing the
  COLOR token on a line that also has a `text-[Npx]` re-flags the pre-existing
  font-size as NEW. Keep legit pre-existing hardcoded-size lines byte-identical,
  or re-snapshot the baseline.
