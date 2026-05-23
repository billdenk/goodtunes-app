---
name: iOS WebKit renderer-kill from stacked backdrop-blur
description: "A problem repeatedly occurred" on mobile Safari over scrolling image lists is usually two fixed-position backdrop-filter surfaces stacked over each other, not a JS leak or data-size issue. Don't go hunting the JS heap until you've audited the GPU layers.
---

## Rule

Never stack two large fixed-position `backdrop-filter` surfaces over a scrolling list of images. Mobile WebKit (iOS 26 confirmed, likely earlier too) kills the renderer with "A problem repeatedly occurred" — looks like a memory crash, is actually GPU compositor budget. Keep backdrop blur radius ≤ ~16px and never combine with `saturate(200%)` on always-on UI. If you need a "frosted" look, prefer higher bg opacity + small blur over low opacity + heavy blur.

**Why:** May 2026 — iPhone 14 Pro on iOS 26.4.2 hard-crashed /collection every time, even after clearing site data and on fresh URLs (`?v=2`). Data was tiny (47 albums, ~200 songs, slim API payload, list capped at 60 rows, images lazy-loaded). Desktop Safari worked perfectly. Real cause was the BottomNav AND MiniPlayer both running `backdropFilter: blur(36px) saturate(200%)` as fixed overlays. Compositor had to re-sample the entire scene behind both layers every frame. Operator was in active investor crisis; spent hours chasing JS-heap red herrings (slimmed API, virtualized list, lazy images, hydration races) before finally checking GPU layers.

**How to apply:**
- When iOS shows "A problem repeatedly occurred" and desktop works, audit `backdropFilter` / `backdrop-blur` on *always-rendered* fixed-position components first. Grep: `rg "backdrop|blur\(3[0-9]|saturate\(2"`.
- The trap: each blur looks fine in isolation. The crash only happens when two stack AND there's a long scrolling list of images underneath. AlbumDetail / single-screen pages won't reproduce it.
- Safe budget: ~14px blur, no saturate, bg opacity ≥ 0.75. Visually almost identical to 36px + 200% saturate but a fraction of the GPU cost.
- Don't trust "A problem repeatedly occurred" to clear after a fix ships — iOS keeps a per-URL crash flag in Safari process memory that survives tab close. User must force-quit Safari (swipe app card off switcher) OR load a different URL like `?v=2`. If `?v=2` also crashes, the bug is real and not iOS stuck-state.
- The Global error reporter / window.onerror banner is useless here — the renderer is killed by the OS before any JS-level error fires.
