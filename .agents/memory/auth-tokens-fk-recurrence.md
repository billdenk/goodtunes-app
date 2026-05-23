---
name: auth_tokens FK recurrence — resolved structurally
description: Historical note. `auth_tokens.user_id` no longer exists; the table now has separate admin_user_id / customer_user_id columns each with a real FK, so the stale `auth_tokens_user_id_users_id_fk` can no longer reappear.
---

# auth_tokens FK recurrence (resolved)

## Current shape
`auth_tokens` has **no `user_id` column** anymore. Instead:

- `admin_user_id`    `varchar REFERENCES users(id)          ON DELETE CASCADE`
- `customer_user_id` `varchar REFERENCES customer_users(id) ON DELETE CASCADE`

Exactly one of the two is set per row, picked by the storage layer from
the `kind` argument. The signup-verify ticket lives in its own table
(`signup_verify_tokens(token, email, created_at)`) so the verify step
never has to write a sentinel into a column that points at a real user
table.

## Why this note still exists
The publish flow diffs **dev DB → prod DB** (see
`dev-prod-schema-drift.md`). For months an old leftover
`auth_tokens_user_id_users_id_fk` lingered in dev DBs from before
dual-auth, and every publish kept re-adding it to prod and 500ing
customer signup verify. With the `user_id` column gone, the FK can no
longer exist on either side, so there is nothing for the diff to
re-add. The Task #264 post-merge FK-sweep was removed.

## How to apply
- Never reintroduce a single `user_id` column on `auth_tokens` — that is
  the shape that couldn't carry an enforced FK.
- Token mints go through `storage.createAuthToken(token, userId, kind)`;
  it routes to the correct column. Don't insert into `auth_tokens`
  directly from new code.
- If you ever see `\d auth_tokens` show a `user_id` column or a FK named
  `auth_tokens_user_id_*` on either DB, a regression has landed —
  re-run the migration block in `scripts/post-merge.sh` (idempotent).
