---
name: auth_tokens FK keeps reappearing
description: Why `auth_tokens_user_id_users_id_fk` re-appears on prod even though `shared/schema.ts` never declares it, and where the durable fix lives.
---

# auth_tokens.user_id FK recurrence

## Rule
`auth_tokens.user_id` must never carry a FK to `users(id)`. Customer tokens
hold a `customer_users.id`, and the signup-verify flow temporarily stores
`verify:<email>` — neither has a matching `users(id)`, so any such FK 500s
the token insert (most painfully: a real fan finishing the 6-digit code on
signup gets a 500 from `insert into auth_tokens`).

## Why it keeps coming back
The schema is clean (no `.references(...)`). The drift comes from the
publish flow:

1. An old leftover FK from before the dual-auth refactor lingers in some
   dev DBs.
2. Replit's publish dialog diffs **dev DB → prod DB** (see
   `dev-prod-schema-drift.md`), not schema → prod.
3. Any dev DB that still carries the FK re-adds it to prod on next publish.
4. `db:push` doesn't drop FKs that vanish from the schema, so manually
   dropping it on prod alone doesn't stick — the next publish from a stale
   dev DB puts it right back.

## How to apply
The durable fix lives in `scripts/post-merge.sh`: it runs
`ALTER TABLE IF EXISTS auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_user_id_users_id_fk`
against both `DATABASE_URL` and `PROD_DATABASE_URL` after every merge.
Idempotent — no-op when the FK is already gone — so it can run forever
without harm.

If you ever see the FK back in `\d auth_tokens`:
- Confirm `shared/schema.ts` still has no `.references(users.id)` on
  `authTokens.userId` (any future addition is the bug).
- Run the post-merge script manually (`bash scripts/post-merge.sh`) to
  sweep both DBs.
- If the FK keeps reappearing despite the sweep, something is re-issuing
  the ALTER between merge and publish — look at recent migration files or
  one-off SQL run against the publish target.
