---
name: Stuck task merge — apply manually from local git history
description: When "Apply changes" bounces back to Ready-for-review repeatedly, the task's commit is usually already fetched locally and can be cherry-picked onto main.
---
The rule: when a task-merge card bounces "Apply changes" → merging → back to "Ready for review" several times (and post-merge runtime is well under its timeout), stop retrying the platform merge and apply it by hand: the task branch's commit is usually already in the local object store (fetched via a `subrepl-*` remote). Find it with `git log --all --oneline -- <touched file>` or by commit message, then `git cherry-pick <sha>` onto main (use `-c user.name/-c user.email`; identity is unset).

**Why:** three bounce attempts (Aug 2026, artwork-template task) with no error surfaced, post-merge healthy at 214s/600s — cherry-pick + `runPostMergeSetup()` applied everything cleanly in minutes.

**How to apply:** after the cherry-pick, run `runPostMergeSetup()` (runs the task's migration + backfill on both DBs), verify schema-drift + tests, then have the user **Cancel/dismiss the task card via ⋮ — never click Apply again** (a later merge would land as a duplicate; see main-hotfix-vs-task-merge-duplicates.md). Also sync the GitHub mirror by hand: a design-studio handoff commit pushed straight to GitHub means DIVERGED — `git fetch <url> main` + merge it in rather than force over it; a GH008 pre-receive reject = missing LFS object, push it with `git lfs push <remote> --object-id <oid>` (NO branch arg — a branch name there is parsed as an oid and fails with "Unable to stat local media path").
