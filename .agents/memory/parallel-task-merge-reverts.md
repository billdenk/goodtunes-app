---
name: Sibling task merges revert in-flight edits
description: Concurrent project-task merges can silently reset files your session (or its subagents) already edited.
---
While a session is editing files, a sibling task reaching MERGED can check out its own version of overlapping files, silently reverting your uncommitted edits — git then shows the file "unmodified" and the work looks done but isn't.

**Why:** Bit twice in one session — a portal-sweep merge reset AdminAlbum/AdminDashboard/AdminLabel mid-run after subagents had reported success; only a fresh `grep`/`git status` caught it.

**How to apply:** After any `[MERGED]` notification lands mid-session, re-grep a signature of your changes (e.g. the class/token you swept away) across every file you touched before trusting earlier "done" reports; re-apply via `sendFollowup` to the original subagent. Also expect merged schema changes to drift the dev DB — run schema-drift-smoke and apply the merge's idempotent post-merge ALTERs to dev.

**Presence isn't enough:** after a sibling merge, grepping that your symbols still *exist* can pass while the merge has SCRAMBLED their order — e.g. a `const` schema map re-landed above the schemas it references (TDZ ReferenceError at import, so every route/test importing the shared module dies). After a merge touching a file you edited, `tsx -e "import('./the/module.ts')"` it, don't just grep.

Update (Aug 24 2026): worse variant seen — during a burst of platform merges, local main was RESET to an older "Published your App" checkpoint lineage, silently dropping ~7 already-pushed commits (whole demo batch). Detection: mirror push rejects non-fast-forward AND signature greps go 0. Recovery: cherry-pick the lost commits (they survive in the local object store / mirror) in dependency order onto the new lineage, then reconcile the mirror with `git merge -s ours FETCH_HEAD` (never --force). STATUS.md conflicts on every pick: strip markers keeping both sides.
