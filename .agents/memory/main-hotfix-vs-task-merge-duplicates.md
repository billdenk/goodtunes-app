---
name: Main-agent hotfix vs task-agent merge duplicates
description: When main agent hand-applies a fix that a queued task agent also implemented, the later merge lands DUPLICATE definitions (schema exports, routes) and can take the whole app down.
---

**Rule:** If main agent hotfixes something on main that a still-unmerged task agent also
implemented (schema table, column, route, component change), the eventual merge does NOT
dedupe — it lands a second copy. Duplicate `export const` in `shared/schema.ts` is fatal:
esbuild transform error → the entire fan+admin client fails to load.

**Why:** Task agents branch from an older main; the platform merge is textual. This bit us
when a publish-safety hotfix added `shopifyGdprRequests` + `users.skipSecondFactor` to
schema.ts, then the task merges re-added both (duplicate export + duplicate column key in
the same pgTable). App down until deduped.

**How to apply:**
- After any merge that overlaps a main-agent hotfix, grep for duplicates:
  `grep -oP '^export const \K\w+' shared/schema.ts | sort | uniq -d` and check the touched
  table for repeated column keys (a duplicate key inside one pgTable is silent in JS —
  last wins — but a duplicate export is a build break).
- Keep the task agent's version (usually richer: indexes, type exports); delete the hotfix stopgap.
- If a queued/IMPLEMENTED task duplicates work already live on main, tell Bill to **Cancel**
  its "Apply changes to main version" card instead of applying — applying re-creates the
  duplicate-definition breakage.
- Idempotent DB migrations make the DB side safe; it's the TypeScript/source side that breaks.
