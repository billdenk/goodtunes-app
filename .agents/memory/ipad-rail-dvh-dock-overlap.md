---
name: iPad rail dvh + dock never overlaps
description: Why the desktop fan rails size off dynamic viewport units, and that the fan Player dock now channel-docks (never overlaps the left rail) at every desktop width.
---

# iPad fan-rail sizing + Player-dock (no overlap)

**Rule:** The desktop fan sidebars (StorefrontSidebar fixed `aside`, and the
AlbumDetailDesktop flex column that holds AlbumDesktopSidebar) must size their
vertical extent off `100dvh` + `env(safe-area-inset-bottom)`, never raw `100vh`
or a fixed `bottom` inset.

**Why:** On iPad Safari `100vh` (and a fixed-positioned `bottom`) resolve
against the *chrome-hidden* (large) viewport, so a bottom-pinned account/avatar
slides under the address/tab bar. `100dvh` tracks the actually-visible viewport;
the safe-area inset clears the home indicator inside the Capacitor webview.

**The fan dock NO LONGER overlaps the left rail — at any width.** This reverses
the prior "intentional iPad rail/dock overlap" decision: Bill asked for the
Apple-Music behavior where the player stays tucked in the content channel
between the rails and never covers the left nav / account chip. The fan
(`density="compact"`) `PlayerDock` is given `channelLeft`/`channelRight` insets
by its hosts and only mounts at the desktop-shell width (≥1024px, where the
rail is visible), so it now channel-docks at **every** width and is never
edge-to-edge. `edgeToEdge` in PlayerDock.tsx is gated off for the compact-density
dock with channel insets; edge-to-edge is reserved for the admin/default dock
and the demo `forceCompact` callers.

**How to apply:** because the dock never overlaps, the account chip never
reserves dock clearance — it just keeps its `mb-4` (16px) resting gap + the
device safe-area inset. The old `FAN_DOCK_CLEARANCE` / `COMPACT_DOCK_BREAKPOINT`
constants (and the `dockNarrow`/`reserveDock` media-query logic in both
sidebars) were removed. Don't reintroduce a width-gated overlap or a clearance
reservation — that's the regression this task fixed.

**Sandbox caveat:** the mockup-sandbox keeps hand-maintained parallel copies of
these components (`artifacts/mockup-sandbox/.../preview-purchase-desktop/_shared.tsx`),
NOT a re-export — mirror any polish by hand; the real components can import from
`@/hooks` freely.
