---
name: Env-var fixes need a republish to reach prod
description: Why deleting/setting an env var doesn't change the live deployment, and how to close such tasks
---
Deleting or changing a workspace env var (shared/dev/prod) does NOT affect the currently
running deployment — the deployment environment is snapshotted at publish time, and only a
USER-initiated republish refreshes it. Task agents also cannot send real mail (no
RESEND_API_KEY in task envs).

**Why:** Task #3314-style "remove the redirect env var" work was repeatedly rejected by the
completion review because production still carried the baked-in value.

**How to apply:** for any env-config change with a required production outcome: (1) make the
config change + dev verification, (2) write the honest prod caveat into docs/STATUS.md,
(3) hand the republish + live verification back to the user as an explicit blocker/follow-up
task rather than looping on markTaskComplete.
