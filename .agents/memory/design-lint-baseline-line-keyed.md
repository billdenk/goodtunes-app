---
name: design-lint baseline is content keyed (not line keyed)
description: How .design-lint-baseline.json keys entries, why legit new code re-flags, and when to surgically merge vs blanket --update-baseline.
---

`npm run design:lint` diffs live findings against `.design-lint-baseline.json`. The key is **`rule \u0001 file \u0001 snippet`** (trimmed line content, first 200 chars) — **line numbers are deliberately NOT part of the key** (writeBaseline comment: "line numbers shift constantly"). So a finding is "fresh" only when its exact trimmed line content isn't already baselined for that rule+file. Run `npm run design:lint -- --json` to get `{total, baseline, new, violations}` where `violations` = the fresh ones.

**When migrating a UI line** (e.g. hand-rolled circular `<button>` → `IconButton`), a pre-existing baselined raw-hex SVG (`fill="#FF5470"` heart, `fill="#4AFFCA"` bookmark) moves onto a *new line whose content differs slightly*, so it reports as a NEW `[brand-hex-literal]`. Re-snapshot; don't convert one-off hearts to `var(--brand-pink)` (makes them inconsistent with the dozens of other raw-hex hearts in Player.tsx / AlbumDetail.tsx).

**When adding new small corner chips** that mirror an established baselined house pattern (e.g. a "Demo" pill at `text-[10px]` matching the baselined `×N` owned badge, or a block card `<Link>` matching the baselined card Links at AdminCustomerDetail 254/298), the new snippets are legitimately baseline-worthy too.

**Critical: blanket `--update-baseline` vs surgical merge.**
**Why:** the workspace baseline is frequently *already failing* with pre-existing un-baselined drift in files you never touched (seen: `client/src/pages/AdminAlbums.tsx`, all of `artifacts/mockup-sandbox/`). Blanket `--update-baseline` snapshots **every current finding**, silently absorbing those unrelated offenders and masking real drift another task should fix.
**How to apply:** when the `design-lint` workflow is already red from unrelated files, do NOT run `--update-baseline`. Instead: (1) prefer fixing your own findings to comply (use `text-xs` etc.); (2) for findings that legitimately mirror an existing baselined pattern, extract ONLY your files' entries from `--json` and append `{rule,file,snippet}` to `.design-lint-baseline.json` programmatically. Verify with `--json` that your files show 0 fresh; the remaining fresh count will still be the pre-existing unrelated ones (that's expected, not your regression).

**Gotcha when verifying:** the `design-lint` workflow's `/tmp/logs` snapshot is written by `refresh_all_logs`, not live — after editing the baseline it can still show a stale "baseline: NNNN / N NEW" run. Trust a fresh local `npm run design:lint -- --json` over the workflow log.
