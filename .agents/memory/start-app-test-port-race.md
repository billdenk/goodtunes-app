---
name: Start-app vs test workflow port 5000 race
description: Why restarting "Start application" can fail with EADDRINUSE while the test workflow runs
---

Restarting the `Start application` workflow can fail repeatedly with `EADDRINUSE: address already in use 0.0.0.0:5000` even though no `tsx server/index.ts` process shows in `pgrep` and `ss -ltnp | grep :5000` reports the port free a moment later.

**Why:** the `test` workflow runs `tsx --test` over the `*.db.test.ts` route tests, which import `server/index.ts`; that import arms the schedulers and binds port 5000. Because the test process never unrefs (schedulers keep it alive), it intermittently squats on 5000 during the db-route portion of the run. The listening socket is owned by the `tsx --test` process, not a `server/index.ts` process, so `pgrep -f "tsx server/index.ts"` misses it and `ss` only shows it bound while a db-route file is mid-flight.

**How to apply:** don't treat an `EADDRINUSE` restart failure of `Start application` as a code defect. Confirm code health another way (the `test` workflow itself booting `server/index.ts` cleanly + tests passing is proof), then retry the restart during a window when the test run is on a *client* test file (port shows free). `curl localhost:5000/api/health` returning 503 = edge proxy, no backend; 200 = your fresh instance is up.

**Running a `*.db.test.ts` route test STANDALONE while the dev server is up:** the boot path reads `process.env.PORT` (default 5000), so it collides with the running `Start application` and reports a file-level `EADDRINUSE` *after* all assertions pass (the test runner mis-attributes it to the `before` hook). Prefix the run with `PORT=0` (`PORT=0 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test --test-force-exit server/foo.db.test.ts`) to bind a random port → clean pass. The assertions themselves pass either way; only the file-level result flips.
