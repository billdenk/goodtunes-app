---
name: Post-merge timeout bounces task merges
description: "Apply changes" reverting to Ready-for-review with no visible error = post-merge script exceeding its timeout
---
The rule: when a task merge repeatedly bounces from "Apply changes" back to "Ready for review" with no error surfaced, suspect the post-merge script timing out before suspecting the task's code.

**Why:** scripts/post-merge.sh has accreted hundreds of idempotent migrations and now runs ~250s locally; the configured timeout was 300s, so under merge-time load it exceeded the budget and the platform reverted the merge silently (Task "Fix 13 security CVEs" bounced twice this way). Timeout raised to 600s (Aug 2026).

**How to apply:** run `runPostMergeSetup()` and compare `durationMs` vs `timeoutMs`; if close, `setPostMergeConfig({ timeoutMs })`. Long-term, prune fully-applied marker-guarded one-shot sections from post-merge.sh to keep runtime down. (The `unterminated here-document` warnings from `$(psql ... <<'SQL')` are benign bash noise, not failures.)
