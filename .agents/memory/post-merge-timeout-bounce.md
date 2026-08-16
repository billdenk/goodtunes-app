---
name: Post-merge timeout bounces task merges
description: "Apply changes" reverting to Ready-for-review with no visible error = post-merge script exceeding its timeout
---
The rule: when a task merge repeatedly bounces from "Apply changes" back to "Ready for review" with no error surfaced, suspect the post-merge script timing out before suspecting the task's code.

**Why:** scripts/post-merge.sh has accreted hundreds of idempotent migrations and now runs ~250s locally; the configured timeout was 300s, so under merge-time load it exceeded the budget and the platform reverted the merge silently (Task "Fix 13 security CVEs" bounced twice this way). Timeout raised to 600s, then 900s after bounces recurred at ~224s local runtime (Aug 2026) — merge-time load can 2-3x the local duration.

**How to apply:** run `runPostMergeSetup()` and compare `durationMs` vs `timeoutMs`; if close, `setPostMergeConfig({ timeoutMs })`. (The `unterminated here-document` warnings from `$(psql ... <<'SQL')` are benign bash noise, not failures.)

**Fingerprint skip (Aug 2026 permanent fix):** after a full successful pass, the script stamps `pm_fullrun_<sha16-of-itself>` into one_shot_markers on BOTH DBs; later runs with an unchanged script + both stamps skip the entire migration suite (~6s total: npm install + mirror sync). Any edit to the script changes the hash → one full pass → re-stamp. `FORCE_FULL_POST_MERGE=1` forces a full pass (needed only for deferred backfills that left their own marker unset). Mirror sync now runs LAST and always (skip path included); its in-function `PLATFORM_TIMEOUT` constant must track the configured .replit timeout (currently 900s) or it self-skips "out of time". New migration sections must go INSIDE one of the two `if [ "$PM_SKIP" != "1" ]` blocks (part 1 before the mirror helpers, part 2 after), above the stamping lines at the bottom.
