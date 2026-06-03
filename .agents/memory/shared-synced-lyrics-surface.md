---
name: Shared synced-lyrics surface
description: Where the karaoke lyrics logic lives so the mobile player and the desktop lyrics panel never drift.
---

The Apple-Music karaoke lyrics column is ONE shared component, not duplicated per surface.

- Pure timing engine: `client/src/lib/syncedLyrics.ts` (`SyncedLine` + `buildSyncedLines`).
- Rendered column: `client/src/components/ui/SyncedLyrics.tsx` — active-line tracking, ~28%-down auto-scroll, monotone blur/fade focus stack, instrumental gap dots, top/bottom mask fade, "Written by" credit. Configurable via props (fontSize/gapClassName/scrollOffsetRatio/paddingTop/paddingBottom/maskImage/className/active). Internals are driven entirely by props — never edit them per consumer.
- Consumers: `client/src/pages/Player.tsx` (mobile Now Playing) and the **desktop right-side lyrics slide-in panel** — `client/src/pages/AlbumDetailDesktop.tsx` builds the `<SyncedLyrics>` body and passes it as the `lyrics` prop into the panel hosted by `client/src/components/ui/DesktopAlbumView.tsx` (the panel animates its own width 0↔360 so the album content reflows beside it; lg-only).

**Why:** Behavior previously lived inline in Player.tsx; the desktop surface needs identical karaoke behavior. Forking it would let the two surfaces drift (Bill has caught lyric-focus regressions before). The desktop full-screen immersive player (old Task #1056, `DesktopImmersivePlayer.tsx`) was REMOVED — desktop lyrics is now a single entry point: the dock lyrics button toggles the side panel (no expand-to-full-screen affordance).

**How to apply:** Any change to lyric timing, highlight, auto-scroll, blur ramp, or gap dots goes in the shared files — never re-inline it into a consumer. Sizing differences (desktop panel uses a smaller fontSize than mobile; mobile keeps the defaults) are props, not forks.
