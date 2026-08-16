---
name: Mirror push must not force blindly
description: Ruby (design studio) pushes handoff commits to the same GitHub mirror main; a --force push orphans them.
---

The GitHub mirror (`billdenk/goodtunes-app` main) is NOT write-only from our side: Ruby pushes handoff correction commits directly to the same `main`. A `git push --force` from the workspace orphans any commits Ruby landed since our last push (bit us Aug 16 2026: `f9adddf`/`fd92b0f` were clobbered).

**Why:** the standing mirror-push command historically used `--force`; that was safe only while we were the sole writer.

**How to apply:**
- Push WITHOUT `--force` first; only force if the ref genuinely diverged from something we intentionally rewrote, and only after checking `git ls-remote` / the incoming SHAs against any handoff SHAs mentioned in chat.
- If a force-push already orphaned commits: they are still recoverable via the GitHub API by SHA (`GET /repos/.../commits/<sha>` for the diff, `GET /repos/.../contents/<path>?ref=<sha>` for full files) through the Replit GitHub connection — plain `git fetch <sha>` will NOT work for unreachable objects.
