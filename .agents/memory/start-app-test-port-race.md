---
name: Bootstrap must stay importer-free (test :5000 EADDRINUSE)
description: Why no module may import server/index.ts, and the EADDRINUSE flake that returns if one does
---

`server/index.ts` is the app entry point and unconditionally binds port 5000 (`httpServer.listen`) at module load. It must therefore have ZERO importers: if any non-entry module imports it, every test that transitively reaches that module loads the bootstrap and tries to bind 5000, colliding with the running dev server → file-level `EADDRINUSE 0.0.0.0:5000`. The `tsx --test` runner mis-attributes the late async error to an unrelated file's `before` hook, so the symptom looks like random db-route test files failing while their assertions actually PASS.

**Why:** historically `log()` lived in and was exported from `server/index.ts`; `giftScheduler.ts` + `odoo.ts` imported it, and those are reachable from `server/routes.ts` (which every db-route test imports) — so the whole suite intermittently squatted 5000. The listener is owned by the `tsx --test` process (schedulers never unref), so `pgrep -f "tsx server/index.ts"` misses it and `ss` only shows it bound while a db-route file is mid-flight.

**Fix (shipped):** `log()` now lives in its own leaf module `server/log.ts`; index.ts imports it like everyone else. `server/index.ts` has no importers, so no test loads the bootstrap and nothing but the real entry binds 5000.

**How to apply:** NEVER add an `export` to `server/index.ts`, and never import from it — put shared helpers in their own module. If the `:5000` EADDRINUSE flake ever returns, run `rg "from ['\"]\.{1,2}/index['\"]" server | rg -v reports/` — a non-empty result (excluding the unrelated `server/reports/index.ts` barrel) is the regression. A standalone db-route run while the dev server is up otherwise binds its own `listen(0)` cleanly; only re-introduce `PORT=0` if something resurrects the bootstrap import.
