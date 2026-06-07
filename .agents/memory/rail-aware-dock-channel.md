---
name: Rail-aware PlayerDock channel docking
description: How the desktop fan PlayerDock centers between rails and why it must auto-disable on narrow widths.
---

# Rail-aware PlayerDock channel docking

The desktop fan `PlayerDock` (compact density) does NOT window-center. The host
passes `channelLeft`/`channelRight` insets and the pill centers on the content
channel `[channelLeft, windowWidth - channelRight]` — the gutter between the
left nav rail and the right lyrics rail — sliding/resizing on a
`transition-[left,width]` when lyrics open/close.

**Why:** window-centering put the dock under the lyrics rail and ignored the
nav rail, so the floating pill looked off-center on the content channel.

**How to apply:**
- Channel mode is gated on `!edgeToEdge && channelLeft != null && channelRight != null`.
  `edgeToEdge` = compact && not forceCompact, i.e. the narrow regime
  (`windowWidth < COMPACT_BREAKPOINT` = 1100). So channel mode AUTO-DISABLES at
  iPad width — this is deliberate: it preserves the intentional iPad rail/dock
  overlap (see `ipad-rail-dvh-dock-overlap.md`). Do not "fix" the dock to honor
  channels below 1100.
- Album page host passes `channelLeft=244` (12 inset + 220 sidebar + 12 gap)
  and `channelRight = LYRICS_PANEL_WIDTH` only while lyrics open at lg.
  Storefront (`MiniPlayer`/`DesktopMiniPlayer`) passes
  `channelLeft=STOREFRONT_CONTENT_OFFSET`, `channelRight=0`.
- Admin passes neither prop → stays window-centered. No new backdrop-filter
  layer was added (channel docking is pure positioning).
- Companion: the album lyrics rail aside in `DesktopAlbumView` (and the search
  rail in `AlbumDetailDesktop`) now runs the FULL `100dvh` flush to the bottom
  window edge, matching the storefront `DesktopLyricsRail`'s flush treatment
  (navy `rgba(10,14,42,0.97)`, top-left corner only, top/left hairlines, inward
  shadow). `LYRICS_DOCK_CLEARANCE` was REMOVED — at lg the dock reserves
  `LYRICS_PANEL_WIDTH` as its right channel so it sits to the rail's LEFT and
  never overlaps; `SyncedLyrics`' own bottom padding handles the 1024–1099 band
  where the dock is edge-to-edge. Engine (timing/scroll/blur) untouched.
