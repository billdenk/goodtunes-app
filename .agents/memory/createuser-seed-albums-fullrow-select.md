---
name: createUser seed-albums full-row select breaks tests on drifted clones
description: Why route-level tests that mint a user 500 in isolated DB clones, and how to guard them
---
storage.createUser grants every new signup the seed albums via
`db.select().from(albums)` — a SELECT of EVERY column shared/schema.ts
declares for albums. Any route test that drives a real handler which mints
a user (e.g. /api/invites/:token/accept) transitively runs that full-row
SELECT.

**Why it bites:** isolated/throwaway task DB clones lag shared/schema.ts, so
the newest nullable album columns can be missing; the full-row SELECT then
fails and the route returns 500. Tests that seed via raw INSERTs (not
createUser) never hit it, so the failure looks isolated/flaky.

**How to apply:** don't fix by mutating the env and don't use db:push (it is
interactive here and proposes destructive table renames on the clone).
Instead make the test self-sufficient: in a `before` hook, idempotently
`ALTER TABLE albums ADD COLUMN IF NOT EXISTS <col> <type>` for the columns
createUser needs. Same pattern applies to any future route test that mints a
user against a possibly-drifted clone.
