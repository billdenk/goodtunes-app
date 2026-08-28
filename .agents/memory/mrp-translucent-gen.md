---
name: MRP Translucent group is generated, not photo tiles
description: MRP's exact "Translucent" vinyl category renders via the Standard generator's trans finish; photos kept as reference; hex table duplicated shared/server.
---

MRP's exact "Translucent" vinyl category is normalized to gen `{styleId:'standard', option:'trans'}` per swatch, photos kept on `customImg` for compare/rebuild.

**Why:** photo-only imports rendered opaque tiles, untrue to the group's name; Bill wants generated discs win visually but source photos never discarded.

**How to apply:**
- Helper `applyMrpTranslucentStandardGen` + `isMemphisPress` live in shared/pressComponents.ts (pure, testable without server/db imports). Called from `seedVinylFromPackages` (fresh envs) and the marker-guarded one-time backfill (`task_3451_mrp_translucent_gen`) — one-time by design so an operator who deliberately removes a swatch's gen is never re-clobbered.
- The T01–T15 name→hex table is DUPLICATED between shared/pressComponents.ts and server/pressCatalog.ts (Task #672 table) — keep in sync; shared can't import server. Placeholder base `#0C0C0C` = "no saved hex"; a real saved base always wins.
- Editor: a gen'd swatch that still carries customImg gets replaceOf threaded in EDIT mode too (compare drawer without the replace semantics); edit-in-place saves re-attach customImg — only the explicit Replace flow drops the upload.
