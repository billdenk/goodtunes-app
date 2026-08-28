---
name: Completion validation vs sibling merges
description: markTaskComplete rebase TIMEOUTs self-heal via continueMergeResolution; sibling task merges break validation via un-run dev-DB migrations.
---
**Rule:** When markTaskComplete errors with a git-status "Rebase onto the main repl failed (TIMEOUT)", just call `continueMergeResolution({})` — it usually reports "completed cleanly" — then retry markTaskComplete. Don't debug git.

**Why:** The pre-rebase status probe times out on large worktrees; the rebase itself succeeds. Seen repeatedly Aug 2026.

**How to apply:** The mirror-freshness validation also hard-fails when the GitHub mirror is AHEAD (Ruby/main pushing handoffs live): fix by fetching the mirror tip with the deploy-key helpers sourced from post-merge.sh and RESTACKING your commit on top of it (reset --hard tip + cherry-pick your commit) — cherry-picking the mirror commit onto yours gets a new SHA and still fails; expect to re-fetch and restack if pushes keep landing mid-validation. Also expect each SIBLING task merge during your completion loop to re-fail validation with dev-DB schema drift or NOT-NULL test failures: the merged task's post-merge migrations exist in scripts/post-merge.sh but never ran in YOUR task env. Find the sibling's migration block there and run its SQL against dev (`$DATABASE_URL`) by hand, re-run the one failing test file, retry completion.

**Diverged-mirror heal — don't bother merging:** when the mirror is AHEAD with Ruby handoff commits, merging FETCH_HEAD into the task branch does NOT survive completion — the completion rebase linearizes the merge (new SHAs), so the mirror reads DIVERGED again. Go straight to the sanctioned heal in github-mirror-push.md: verify mirror-tip diff vs merge-base touches only handoff/, force-push the PROJECT MAIN tip (main-repl/main) to mirror main with the deploy key (handoff content survives on your branch via the rebase copies), then retry markTaskComplete. Worked cleanly 2026-08-28.
