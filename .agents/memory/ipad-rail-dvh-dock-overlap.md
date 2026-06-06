---
name: iPad rail dvh + dock overlap
description: Why the desktop fan rails size off dynamic viewport units and only reserve Player-dock clearance at iPad width.
---

# iPad fan-rail sizing + Player-dock overlap

**Rule:** The desktop fan sidebars (StorefrontSidebar fixed `aside`, and the
AlbumDetailDesktop flex column that holds AlbumDesktopSidebar) must size their
vertical extent off `100dvh` + `env(safe-area-inset-bottom)`, never raw `100vh`
or a fixed `bottom` inset.

**Why:** On iPad Safari `100vh` (and a fixed-positioned `bottom`) resolve
against the *chrome-hidden* (large) viewport, so a bottom-pinned account/avatar
slides under the address/tab bar. `100dvh` tracks the actually-visible viewport;
the safe-area inset clears the home indicator inside the Capacitor webview.

**Dock overlap is width-gated.** The fan compact `PlayerDock` only switches to
its edge-to-edge (`left-2 right-2`) layout — the one that covers the left rail —
*below* `COMPACT_BREAKPOINT` (1100px, in PlayerDock.tsx). At ≥1100px it's a
centered pill that never touches the left rail. So reserve dock clearance under
the account chip ONLY when viewport < 1100 (iPad width); doing it on a wide
desktop just creates an empty gap = a regression.

**How to apply:** shared constants `FAN_DOCK_CLEARANCE` + `COMPACT_DOCK_BREAKPOINT`
live in `client/src/hooks/useDesktopShell.ts`. StorefrontSidebar reserves only
when a song is playing (`usePlayer().currentSong`) AND narrow — no song means
DesktopMiniPlayer renders nothing, so keep the chip flush. The album-detail dock
never collapses, so AlbumDesktopSidebar reserves whenever narrow.

**Sandbox caveat:** the mockup-sandbox keeps hand-maintained parallel copies of
these components (`artifacts/mockup-sandbox/.../preview-purchase-desktop/_shared.tsx`),
NOT a re-export — mirror any polish by hand; the real components can import from
`@/hooks` freely.
