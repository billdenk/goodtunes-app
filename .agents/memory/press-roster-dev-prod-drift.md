---
name: Press roster dev↔prod drift
description: Why manufacturers + press_* tables drift between dev and prod, and how reconciliation must be done so a publish (dev→prod data diff) stays safe.
---

The press roster (`manufacturers` + every `press_*` child table + the
`fulfillment_partners` they reference) does NOT stay aligned between the
canonical dev DB and prod, and publish diffs **dev → prod** (see
`dev-prod-schema-drift.md`). Two independent reasons:

1. **Founding-seed presses get fresh ids per clone.** `ensureFoundingPresses()`
   (server/routes.ts) seeds ONLY Memphis + Hellbender, minting brand-new random
   UUIDs every time a dev DB is created. So Hellbender/Memphis ids in dev never
   match prod even though the rows are "the same" press by domain.
2. **Some presses are prod-only, hand-created.** Physical Music Products and
   Hoover Printing were added by hand in prod and are absent from any seed
   (`seedPmpCatalog()` bails if the PMP manufacturer row is missing). A stale dev
   therefore lacks them entirely.

**Why this is a publish hazard:** if publish data-diffs by id, prod-only rows get
DROPPED from prod on publish (taking PMP's confirmed pricing ladders with them),
and a dev-only leftover (the retired "Precision Pressing", domain
`precisionpressing.com`, dropped from the seed but still sitting in canonical
dev) gets ADDED to prod.

**How to reconcile (the pattern used):** copy the prod rows into dev with prod's
**EXACT ids** (ID-preserving is mandatory) via static `INSERT ... ON CONFLICT
(id) DO NOTHING` snapshots embedded in `scripts/post-merge.sh`, run **dev-only**
(`migrate_reconcile_press_roster dev "${DATABASE_URL:-}"`) — prod is the source
of truth and must never be mutated from post-merge. Insert order respects the FKs
that actually exist: `fulfillment_partners` → `manufacturers` →
`press_formats`/`press_jackets`/`press_color_tiers` → `press_colors` (FK→tiers) →
`press_tier_jacket_ladders` (FK→tiers+jackets). `press_*.press_id` columns are
loose (no FK); only `press_colors.tier_id` and ladder tier_id/jacket_id are real
FKs. ON CONFLICT(id) DO NOTHING is convergent with the lazy `seedPmpCatalog()`
because its `ensure*` helpers match by natural key and reuse existing rows
instead of minting duplicates — so a later catalog read won't re-drift the ids.

**Generating the snapshot:** have Postgres emit the INSERTs itself
(`quote_nullable`, `price_ladder::text`, `specialties::text`) base64-encoded so
executeSql's CSV output stays clean, then decode in JS. Do NOT build the splice
with `String.replace()` — its replacement string eats `$$` (turning PL/pgSQL
`DO $$` dollar-quotes into `$`) and can shift indentation onto the heredoc
terminator; use slice + string concatenation instead.

**Still drifted (not fixed here):** Hellbender + Memphis ids remain dev≠prod
because the founding seed re-mints them. That is the same publish hazard for the
two founding presses and needs its own treatment (e.g. seed them with prod's
fixed ids, or reconcile them the same way).
