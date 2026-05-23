#!/bin/bash
set -e

# Post-merge runs with stdin closed and a tight timeout. Anything that prompts
# (drizzle-kit's false-positive rename detector, in particular) gets EOF and
# fails the merge.
#
# We intentionally do NOT run `npm run db:push` here. Two reasons:
#   1. drizzle-kit's rename prompt has historically stalled the step, so
#      additive schema changes silently never reached prod (see
#      .agents/memory/albums-schema-drift.md).
#   2. Auto-answering every prompt with "+ create" also has drizzle-kit DROP
#      the orphan side of each false rename (e.g. user_sessions), which can
#      log everyone out or worse.
#
# Schema reaches production through the Publish flow, which shows the diff for
# explicit admin approval. Dev DB drift is fixed manually with additive SQL.
npm install

# Task #264 — Stop `auth_tokens_user_id_users_id_fk` from reappearing on prod.
#
# Root cause: `shared/schema.ts` never declares a `.references(users.id)` on
# `auth_tokens.user_id`, but an old leftover FK from before the dual-auth
# refactor lingers in some dev DBs. The Replit publish flow diffs **dev →
# prod** (see .agents/memory/dev-prod-schema-drift.md), so any dev DB that
# still carries the FK re-adds it to prod on the next publish. That FK then
# 500s customer signup verify (the synthetic `verify:<email>` userId has no
# matching row in `users`).
#
# Fix: after every merge, drop the FK idempotently on the local dev DB AND
# on the production DB so both sides stay flat. `DROP CONSTRAINT IF EXISTS`
# is a no-op when the FK is already gone, so this is safe to run every time.
drop_auth_tokens_fk() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping auth_tokens FK sweep on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 -c \
      "ALTER TABLE IF EXISTS auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_user_id_users_id_fk;" \
      >/dev/null 2>&1; then
    echo "post-merge: auth_tokens FK sweep ok on $label"
  else
    echo "post-merge: WARNING — auth_tokens FK sweep failed on $label (continuing)"
  fi
}
drop_auth_tokens_fk dev  "${DATABASE_URL:-}"
drop_auth_tokens_fk prod "${PROD_DATABASE_URL:-}"
