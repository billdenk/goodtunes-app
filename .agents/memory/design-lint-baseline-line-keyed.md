---
name: design-lint baseline is line-content keyed
description: Why migrating a UI line to IconButton re-flags a pre-existing baselined raw-hex SVG as NEW, and the correct response.
---

`npm run design:lint` diffs against `.design-lint-baseline.json`, which is keyed by file + line + matched line content. So when you migrate a hand-rolled circular `<button>` to the `IconButton` primitive, any pre-existing baselined raw brand-hex SVG on the moved lines (e.g. a `fill="#FF5470"` heart or `fill="#4AFFCA"` bookmark) re-appears at a new line/content and is reported as a NEW `[brand-hex-literal]` violation — even though you didn't introduce it.

**The fix:** re-snapshot with `npm run design:lint -- --update-baseline`. This is the documented "legacy page intentionally migrated" case, NOT silencing drift you introduced — the hex literals already existed and raw hex in heart/star/bookmark SVGs is the established (baselined) pattern across Player.tsx and AlbumDetail.tsx. Do NOT convert just the migrated hearts to `var(--brand-pink)`; that makes them inconsistent with the dozens of other raw-hex hearts in the same files.

**Why:** the baseline absorbs existing offenders; line moves break the match. Converting one-off would create visual/code inconsistency for no real gain.

**Gotcha when verifying:** the `design-lint` workflow's `/tmp/logs` snapshot is written by `refresh_all_logs`, not live — after `--update-baseline` it can still show the stale "baseline: 3258 / N NEW" run. Trust a fresh local `npm run design:lint` ("clean (… known)") and re-run `refresh_all_logs` to see the workflow flip to FINISHED/clean.
