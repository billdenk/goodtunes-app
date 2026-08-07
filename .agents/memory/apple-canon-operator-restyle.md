---
name: Apple canon operator restyle
description: The official visual spec for admin/artist/press/NPO surfaces and how the restyle is being applied screen-by-screen
---

# Apple canon (operator & partner surfaces)

- Spec: `docs/apple-canon.md` (blessed 2026-08-07) + reference screenshots in `docs/design-reference/*.jpg`. Fan navy shell is explicitly out of scope.
- Tokens live in `client/src/index.css` as `--apple-*` (light on `:root`, dark under `.gt-admin-dark`, incl. `--apple-rail` #1c1c1e dark / canvas-gray light). Canon styling for the dashboard is scoped under `.gt-admin .gt-dashboard-canon` so unrestyled admin pages are untouched.
- **How to apply:** restyles are VISUAL-ONLY (keep hooks/routes/testids/handlers); one filled blue pill per screen, everything else quiet borderless text buttons; two-tone headings; no emojis, real ®. Bill approves screen-by-screen — dashboard done first (Aug 2026), remaining admin/artist/press/NPO screens pending his go-ahead per screen.
- Reference mockup source now IS in-repo: `docs/design-reference/code/AdminDashboardApple.tsx` (checked out from the GitHub design PR via single-path checkout). Copy its exact values; don't work from jpgs alone.
- Dashboard restyle redone against that source Aug 2026: exact tokens (canvas #fbfbfd, tile #f2f2f5 as `--apple-tile`), rounded-full RangeSwitcher, WorkQueue attention cards (severity washes, grid-rows collapse), 38px KPI tiles (no sparklines, shared KpiCard left for artist path), AreaChart trend with prior dashed gray, "As it happens." feed with All/Sales/Added/Ops chips, ranked lists 3fr/2fr. Dead OpsHealthStrip + all gt-attention/gt-rank/gt-winning CSS deleted (its ops-chip-* testids were never rendered or tested). Design-lint baseline re-snapshotted (5386).
- Shell (AdminFrame) is canon as of Aug 2026: white full-width top band (logo row bg-white), pill search, People top-level rail item (NOT under Catalog — also removed from SECTION_FOR_ENTITY), active rail row = quiet white card + hairline (no blue wash). UI-COPY-ONLY renames: "Albums"→"Projects", "GoodDeed pricing"→"GoodDeed®" (routes/testids/identifiers unchanged, same rule as the vendor→Maker/Reseller rename). Page-internal copy still says "Albums" — sweep per screen as Bill approves each.

# GitHub remote is NOT pullable wholesale

- The GitHub repo (`billdenk/goodtunes-app`, remote name `github`, added Aug 2026) is a one-way mirror that lags main badly whenever the deploy key is missing; its main can carry user-made commits (e.g. the design PR) on top of a stale base.
- **Why:** pulling/merging github/main would revert thousands of lines of newer repl work.
- **How to apply:** to take user files merged on GitHub, `git fetch github main` then `git checkout github/main -- <paths>` for just those paths. Never `git pull`/merge the branch.
