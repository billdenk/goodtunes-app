---
name: Mockup-sandbox "shim" comments are misleading
description: Desktop fan components claim to be re-exported into the sandbox via thin shims, but the sandbox actually keeps hand-maintained PARALLEL COPIES.
---

# Sandbox keeps parallel copies, not shims

Several client desktop-fan components (`AlbumDesktopSidebar`, `DesktopAlbumView`,
`AlbumDesktopTrackRow`, `PlayerDock`) carry header comments saying they were
"graduated from the sandbox" and are "re-exported via a thin shim so the canvas
stays in sync." **That is not true.** The sandbox cannot import from `client/src`,
so it keeps fully separate inline copies — for the Preview & Purchase desktop
surface they live in
`artifacts/mockup-sandbox/src/components/mockups/preview-purchase-desktop/_shared.tsx`.

**How to apply:** When you polish one of these client components, the canvas will
NOT update automatically. If you want the mockup to match, mirror the change by
hand into the sandbox `_shared.tsx` copy. Prop-signature parity is the only thing
that strictly matters for the canvas to keep building; pure visual polish is a
courtesy mirror.

**Asset paths differ:** the sandbox serves under base `/__mockup/`, so reference
public assets as ``${import.meta.env.BASE_URL.replace(/\/$/,"")}/images/<file>``
and drop the file into `artifacts/mockup-sandbox/public/images/` (the main app's
`client/public/...` root paths won't resolve there).

**Note:** the sandbox's preview-purchase dock uses real album art, so it has no
empty/idle cover slot — the "G-mark idle placeholder" change to `PlayerDock` has
no counterpart to mirror there.
