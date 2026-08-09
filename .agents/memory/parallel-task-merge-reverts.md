---
name: Sibling task merges revert in-flight edits
description: Concurrent project-task merges can silently reset files your session (or its subagents) already edited.
---
While a session is editing files, a sibling task reaching MERGED can check out its own version of overlapping files, silently reverting your uncommitted edits — git then shows the file "unmodified" and the work looks done but isn't.

**Why:** Bit twice in one session — a portal-sweep merge reset AdminAlbum/AdminDashboard/AdminLabel mid-run after subagents had reported success; only a fresh `grep`/`git status` caught it.

**How to apply:** After any `[MERGED]` notification lands mid-session, re-grep a signature of your changes (e.g. the class/token you swept away) across every file you touched before trusting earlier "done" reports; re-apply via `sendFollowup` to the original subagent. Also expect merged schema changes to drift the dev DB — run schema-drift-smoke and apply the merge's idempotent post-merge ALTERs to dev.
