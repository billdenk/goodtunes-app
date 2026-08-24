---
name: Completion validation vs sibling merges
description: markTaskComplete rebase TIMEOUTs self-heal via continueMergeResolution; sibling task merges break validation via un-run dev-DB migrations.
---
**Rule:** When markTaskComplete errors with a git-status "Rebase onto the main repl failed (TIMEOUT)", just call `continueMergeResolution({})` — it usually reports "completed cleanly" — then retry markTaskComplete. Don't debug git.

**Why:** The pre-rebase status probe times out on large worktrees; the rebase itself succeeds. Seen repeatedly Aug 2026.

**How to apply:** The mirror-freshness validation also hard-fails when the GitHub mirror is AHEAD (Ruby/main pushing handoffs live): fix by fetching the mirror tip with the deploy-key helpers sourced from post-merge.sh and RESTACKING your commit on top of it (reset --hard tip + cherry-pick your commit) — cherry-picking the mirror commit onto yours gets a new SHA and still fails; expect to re-fetch and restack if pushes keep landing mid-validation. Also expect each SIBLING task merge during your completion loop to re-fail validation with dev-DB schema drift or NOT-NULL test failures: the merged task's post-merge migrations exist in scripts/post-merge.sh but never ran in YOUR task env. Find the sibling's migration block there and run its SQL against dev (`$DATABASE_URL`) by hand, re-run the one failing test file, retry completion.

**Sibling's unapproved commit falsely flagged in YOUR review:** the completion reviewer can diff against the user's last APPROVED state, so a sibling task's commit that already sits on main-repl/main (but is itself still waiting for approval) shows up as "your" unrelated regression. Don't revert it — verify `git diff main-repl/main..HEAD` is clean and `git merge-base --is-ancestor <sha> main-repl/main`, then retry markTaskComplete with request_fresh_code_review + a drift_reason spelling out the ancestry. Passed on retry Aug 2026.
