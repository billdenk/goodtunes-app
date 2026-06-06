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
- Companion: the lyrics rail aside in `DesktopAlbumView` is height-bounded to
  `calc(100dvh - LYRICS_DOCK_CLEARANCE - safe-area-inset-bottom)` so its content
  ends above the floating dock instead of bleeding behind it. Engine
  (timing/scroll/blur) untouched.
