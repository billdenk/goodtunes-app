---
name: Shared synced-lyrics surface
description: Where the karaoke lyrics logic lives so the mobile player and the desktop lyrics panel never drift.
---

The Apple-Music karaoke lyrics column is ONE shared component, not duplicated per surface.

- Pure timing engine: `client/src/lib/syncedLyrics.ts` (`SyncedLine` + `buildSyncedLines`).
- Rendered column: `client/src/components/ui/SyncedLyrics.tsx` — active-line tracking, ~28%-down auto-scroll, monotone blur/fade focus stack, instrumental gap dots, top/bottom mask fade, "Written by" credit. Configurable via props (fontSize/gapClassName/scrollOffsetRatio/paddingTop/paddingBottom/maskImage/className/active). Internals are driven entirely by props — never edit them per consumer.
- Consumers: `client/src/pages/Player.tsx` (mobile Now Playing) and BOTH desktop surfaces, which `client/src/pages/AlbumDetailDesktop.tsx` builds ONCE as `lyricsBody` (`<SyncedLyrics>`) and renders into exactly one of two layouts depending on viewport:
  - **lg (≥1024):** the right-side slide-in panel hosted by `client/src/components/ui/DesktopAlbumView.tsx` (animates its own width 0↔360 so the album content reflows beside it). Passed via the `lyrics` prop; `lyricsOpen` is gated on `isLgViewport`.
  - **md (768–1023):** a full-bleed lyrics overlay (`lg:hidden`, `absolute inset-0` inside the content column, below the fixed PlayerDock) rendered directly in AlbumDetailDesktop. The dock lyrics button would otherwise be a no-op here because the side panel needs lg-width room.
  - Mutual exclusion: both keyed off `isLgViewport` (`useMediaQuery("(min-width: 1024px)")`), so only ONE SyncedLyrics mounts at a time — `lyricsBody` is reused, not forked.

**Why:** Behavior previously lived inline in Player.tsx; the desktop surfaces need identical karaoke behavior. Forking it would let the surfaces drift (Bill has caught lyric-focus regressions before). The desktop full-screen immersive player (old `DesktopImmersivePlayer.tsx`) was REMOVED — desktop lyrics is a single dock-button entry point (panel at lg, overlay at md). Gotcha: `DesktopAlbumView`'s primary-column reflow (`lg:mx-0 lg:ml-auto`) must stay lg-gated, or at md the column shifts right leaving an empty gap with no panel beside it.

**How to apply:** Any change to lyric timing, highlight, auto-scroll, blur ramp, or gap dots goes in the shared files — never re-inline it into a consumer. Sizing differences (desktop uses a smaller fontSize than mobile; mobile keeps the defaults) are props, not forks. New desktop lyrics treatments should reuse `lyricsBody`, not build a second SyncedLyrics.

**Smooth focus handoff gotcha:** the active-line emphasis must NOT come from `font-weight` (700↔800) — font-weight isn't CSS-interpolable AND the bolder glyphs reflow the line width mid-handoff, which is exactly what reads as a "snap" and fights the auto-scroll. Keep weight constant on every line; carry emphasis with the tween-friendly opacity + blur + glow ramp. Same trap: always emit `filter: blur(0px)` on the active line (never `filter: none`) and a transparent `text-shadow` on inactive lines (never `none`) — CSS can't tween `none`↔`blur()`/`shadow`, so those keywords pop. If a future change reintroduces bold-on-active or `none`, the stutter comes back.

**Pre-existing test note (this env):** `desktopLyricsPanel.test.ts` fails deterministically on unmodified HEAD here (close-X `button-close-lyrics` resolves null after the AnimatePresence panel opens) — it's an env/jsdom+framer issue, not a lyrics regression. `playerLyricsPanel.test.ts` (mobile) passes.
