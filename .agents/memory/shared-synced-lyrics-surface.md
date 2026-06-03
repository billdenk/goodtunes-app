---
name: Shared synced-lyrics surface
description: Where the karaoke lyrics logic lives so the mobile player and desktop immersive player never drift.
---

The Apple-Music karaoke lyrics column is ONE shared component, not duplicated per surface.

- Pure timing engine: `client/src/lib/syncedLyrics.ts` (`SyncedLine` + `buildSyncedLines`).
- Rendered column: `client/src/components/ui/SyncedLyrics.tsx` — active-line tracking, ~28%-down auto-scroll, monotone blur/fade focus stack, instrumental gap dots, top/bottom mask fade, "Written by" credit. Configurable via props (fontSize/gapClassName/scrollOffsetRatio/paddingTop/paddingBottom/maskImage/className/active).
- Consumers: `client/src/pages/Player.tsx` (mobile) and `client/src/components/ui/DesktopImmersivePlayer.tsx` (desktop full-screen).

**Why:** Behavior previously lived inline in Player.tsx; the desktop immersive player (Task #1056) needed identical karaoke behavior. Forking it would let the two surfaces drift (Bill has caught lyric-focus regressions before).

**How to apply:** Any change to lyric timing, highlight, auto-scroll, blur ramp, or gap dots goes in the shared files — never re-inline it into a consumer. Sizing differences (desktop uses larger fontSize) are props, not forks.
