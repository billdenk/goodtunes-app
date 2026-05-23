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

# Task #265 — Migrate auth_tokens to per-side id columns and move the
# signup-verify ticket out of auth_tokens entirely. This supersedes the
# Task #264 FK-sweep: with the old `user_id` column gone, the leftover
# `auth_tokens_user_id_users_id_fk` constraint can no longer exist on
# either side, so nothing for the publish dev→prod diff to re-add.
#
# Everything below is idempotent (IF NOT EXISTS / IF EXISTS), so it is
# safe to run on every merge and on DBs that have already migrated.
migrate_auth_tokens() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping auth_tokens migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS signup_verify_tokens (
  token       varchar PRIMARY KEY,
  email       text    NOT NULL,
  created_at  timestamp DEFAULT now()
);
ALTER TABLE IF EXISTS auth_tokens
  DROP CONSTRAINT IF EXISTS auth_tokens_user_id_users_id_fk;
ALTER TABLE IF EXISTS auth_tokens
  ADD COLUMN IF NOT EXISTS admin_user_id    varchar REFERENCES users(id)          ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customer_user_id varchar REFERENCES customer_users(id) ON DELETE CASCADE;
-- Backfill from the legacy single column, if it still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_tokens' AND column_name = 'user_id'
  ) THEN
    DELETE FROM auth_tokens WHERE user_id LIKE 'verify:%';
    UPDATE auth_tokens
       SET admin_user_id = user_id
     WHERE kind = 'admin'
       AND admin_user_id IS NULL
       AND user_id IN (SELECT id FROM users);
    UPDATE auth_tokens
       SET customer_user_id = user_id
     WHERE kind = 'customer'
       AND customer_user_id IS NULL
       AND user_id IN (SELECT id FROM customer_users);
    -- Anything that still can't be matched is orphan; drop it so the
    -- column-drop below doesn't lose data silently to no one.
    DELETE FROM auth_tokens
     WHERE admin_user_id IS NULL AND customer_user_id IS NULL;
    ALTER TABLE auth_tokens DROP COLUMN user_id;
  END IF;
END
$$;
COMMIT;
SQL
  then
    echo "post-merge: auth_tokens migration ok on $label"
  else
    echo "post-merge: WARNING — auth_tokens migration failed on $label (continuing)"
  fi
}
migrate_auth_tokens dev  "${DATABASE_URL:-}"
migrate_auth_tokens prod "${PROD_DATABASE_URL:-}"
