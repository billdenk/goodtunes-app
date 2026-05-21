---
name: Post-merge db:push hangs on interactive rename prompts
description: Dev DB drifts behind merged schema changes because drizzle-kit push waits on a TTY prompt no one answers. Recognize and recover.
---

## The rule
When a task merges and Drizzle sees a column/table that *could* be a
rename (e.g. an old table was dropped and a new one with similar shape
exists), `drizzle-kit push` opens an interactive prompt
("Is `payout_accounts` created or renamed from another table?"). The
post-merge script runs non-interactively, so push hangs and exits
without applying the migration. The schema and the dev DB silently
drift; the next query that touches the new column returns a 500 with
`column "..." does not exist`, and any UI that reads through that
query falls back to "no data" (e.g. Albums sidebar shows 0 even though
6 rows exist).

**Why:** drizzle-kit push is "are you sure?"-interactive by design and
there's no `--yes` equivalent that handles ambiguous renames safely.
Until the post-merge script grows a flag or moves to versioned
migrations, every merge that includes a structural change is a
candidate for this failure mode.

**How to apply:**
- If the user reports "X is suddenly empty" / "we lost data again" after
  a merge, do NOT assume data loss. First: count rows directly
  (`psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM <table>;"`).
- If the row count is fine but the API errors, refresh the workflow
  logs and look for `column "..." does not exist`. That's the tell.
- Diff the live table (`psql "$DATABASE_URL" -c "\d <table>"`) against
  `shared/schema.ts` and patch with `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS ...` (or rename, etc.) — never run `db:push` interactively
  here; you don't have a TTY.
- Known offenders so far: `payout_accounts` (renamed table → blocks
  every later push), `albums.payout_*`, `vendors/labels.logo_locked`,
  `songs.is_previewable`. If you fix one, list other recently-merged
  schema additions and check them too — the prompt blocks *every*
  subsequent change, not just the one it asked about.
