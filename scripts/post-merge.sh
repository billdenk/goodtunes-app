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

# Task #269 — Admin "Forgot password?" reset tokens. Pre-create on both
# DBs so the publish dev→prod diff doesn't try to invent the table
# (and so signing in on a freshly-cloned dev DB never 500s the
# /api/admin/auth/forgot-password endpoint).
migrate_password_reset_tokens() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping password-reset migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamp NOT NULL,
  consumed_at timestamp,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_password_reset_tokens_user_id_idx
  ON admin_password_reset_tokens(user_id);
SQL
  then
    echo "post-merge: admin_password_reset_tokens migration ok on $label"
  else
    echo "post-merge: WARNING — admin_password_reset_tokens migration failed on $label (continuing)"
  fi
}
migrate_password_reset_tokens dev  "${DATABASE_URL:-}"
migrate_password_reset_tokens prod "${PROD_DATABASE_URL:-}"

# Task #271 — Customer "Forgot password?" reset tokens. Mirror of the
# admin table against customer_users, same single-use SHA-256-hashed
# 30-minute TTL contract. Pre-create on both DBs for the same reasons
# (publish dev→prod diff + fresh-clone dev never 500ing the endpoint).
migrate_customer_password_reset_tokens() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping customer-password-reset migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS customer_password_reset_tokens (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamp NOT NULL,
  consumed_at timestamp,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_password_reset_tokens_user_id_idx
  ON customer_password_reset_tokens(user_id);
SQL
  then
    echo "post-merge: customer_password_reset_tokens migration ok on $label"
  else
    echo "post-merge: WARNING — customer_password_reset_tokens migration failed on $label (continuing)"
  fi
}
migrate_customer_password_reset_tokens dev  "${DATABASE_URL:-}"
migrate_customer_password_reset_tokens prod "${PROD_DATABASE_URL:-}"

# Add-NPO flow — organization↔person join (free-text role) so admins can
# attach one or more People as contacts on an NPO. Pre-create on both
# DBs so the publish dev→prod diff stays empty and a fresh-clone dev
# never 500s the contacts list.
migrate_organization_people() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping organization_people migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS organization_people (
  organization_id varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id       varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role            text,
  created_at      timestamp DEFAULT now(),
  PRIMARY KEY (organization_id, person_id)
);
SQL
  then
    echo "post-merge: organization_people migration ok on $label"
  else
    echo "post-merge: WARNING — organization_people migration failed on $label (continuing)"
  fi
}
migrate_organization_people dev  "${DATABASE_URL:-}"
migrate_organization_people prod "${PROD_DATABASE_URL:-}"

# Task #288 — album_addons drift. shared/schema.ts (Task #245) declares
# five columns on album_addons that drizzle-kit's push silently skipped
# on both dev and prod, so every Sell-tab open 500s on listAllAddons
# (column "print_vendor_id" does not exist) and the panel stays stuck
# on "Loading…". Idempotent ADD COLUMN IF NOT EXISTS sweep on both DBs
# so a fresh-clone dev never reintroduces the bug.
migrate_album_addons_vendor_legs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_addons vendor-legs migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_addons
  ADD COLUMN IF NOT EXISTS print_vendor_id     varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hologram_vendor_id  varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insertion_vendor_id varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_at timestamp;
SQL
  then
    echo "post-merge: album_addons vendor-legs migration ok on $label"
  else
    echo "post-merge: WARNING — album_addons vendor-legs migration failed on $label (continuing)"
  fi
}
migrate_album_addons_vendor_legs dev  "${DATABASE_URL:-}"
migrate_album_addons_vendor_legs prod "${PROD_DATABASE_URL:-}"

# Task #294 — shared per-entity contacts table + LinkedIn URL on people.
# The same Add-a-contact surface now ships on vendor / press / label /
# fulfillment detail pages and they all write here. NPOs keep using the
# older `organization_people` join. Pre-create on both DBs so a
# fresh-clone dev never 500s the new contacts endpoints and the publish
# dev→prod diff stays empty.
migrate_entity_contacts() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping entity_contacts migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS entity_contacts (
  entity_kind text     NOT NULL,
  entity_id   varchar  NOT NULL,
  person_id   varchar  NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role        text,
  created_at  timestamp DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id, person_id)
);
ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin_url text;
SQL
  then
    echo "post-merge: entity_contacts migration ok on $label"
  else
    echo "post-merge: WARNING — entity_contacts migration failed on $label (continuing)"
  fi
}
migrate_entity_contacts dev  "${DATABASE_URL:-}"
migrate_entity_contacts prod "${PROD_DATABASE_URL:-}"

# Task #246 — signed-cert sale-window + reservations + true-up ledger.
# Additive columns on `albums` plus two new tables. Drizzle push has a
# habit of silently skipping additive ALTERs once a release ships, so
# pre-create on both DBs to keep the publish dev→prod diff empty and
# the new admin panel from 500'ing on fresh-clone dev.
migrate_cert_sale_window() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping cert sale-window migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS signed_cert_window_opens_at           timestamp,
  ADD COLUMN IF NOT EXISTS signed_cert_window_closes_at          timestamp,
  ADD COLUMN IF NOT EXISTS signed_cert_window_status             text,
  ADD COLUMN IF NOT EXISTS signed_cert_window_closed_at          timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_sent_to_press_at           timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_at_artist_at               timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_returned_at                timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_hologram_at                timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_shipped_to_fulfillment_at  timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_inserted_at                timestamp,
  ADD COLUMN IF NOT EXISTS cert_batch_notes                      jsonb,
  ADD COLUMN IF NOT EXISTS cert_batch_pdf_asset_url              text,
  ADD COLUMN IF NOT EXISTS cert_batch_pdf_generated_at           timestamp;

CREATE TABLE IF NOT EXISTS cert_reservations (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id             varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  order_id             varchar NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shopify_order_id     text,
  shopify_line_item_id text,
  good_deed_number     integer,
  variant_kind         text    NOT NULL DEFAULT 'printed',
  status               text    NOT NULL DEFAULT 'reserved',
  refunded_at          timestamp,
  refund_shopify_id    text,
  refunded_cents       integer,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cert_reservations_order_uniq UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS cert_reservations_album_status_idx
  ON cert_reservations (album_id, status);

CREATE TABLE IF NOT EXISTS cert_trueup_ledger (
  id                          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id                    varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  batch_size                  integer NOT NULL,
  projected_rung_label        text,
  projected_wholesale_cents   integer,
  actual_rung_label           text,
  actual_wholesale_cents      integer,
  delta_cents_per_unit        integer NOT NULL,
  total_delta_cents           integer NOT NULL,
  owner_kind                  text,
  owner_id                    varchar,
  status                      text    NOT NULL DEFAULT 'pending_no_engine',
  applied_at                  timestamp,
  notes                       text,
  created_at                  timestamp NOT NULL DEFAULT now()
);
SQL
  then
    echo "post-merge: cert sale-window migration ok on $label"
  else
    echo "post-merge: WARNING — cert sale-window migration failed on $label (continuing)"
  fi
}
migrate_cert_sale_window dev  "${DATABASE_URL:-}"
migrate_cert_sale_window prod "${PROD_DATABASE_URL:-}"

# Task #317 — Master tech-spec columns on songs. Populated at upload by
# ffprobe so the admin track row can render a one-line readout (format,
# sample rate, bit depth, channels, bytes, duration) for both the
# AS-SERVED playback file and, when transcoded, the AS-PRESSED original.
# Additive nullable columns — older rows just keep showing NULL until
# the boot-time backfill (RUN_LEGACY_BACKFILLS=1) re-probes them.
migrate_song_audio_specs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping song audio-specs migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS audio_format                 text,
  ADD COLUMN IF NOT EXISTS audio_container_ext          text,
  ADD COLUMN IF NOT EXISTS audio_sample_rate            integer,
  ADD COLUMN IF NOT EXISTS audio_bit_depth              integer,
  ADD COLUMN IF NOT EXISTS audio_channels               integer,
  ADD COLUMN IF NOT EXISTS audio_bytes                  integer,
  ADD COLUMN IF NOT EXISTS audio_source_format          text,
  ADD COLUMN IF NOT EXISTS audio_source_container_ext   text,
  ADD COLUMN IF NOT EXISTS audio_source_sample_rate     integer,
  ADD COLUMN IF NOT EXISTS audio_source_bit_depth       integer,
  ADD COLUMN IF NOT EXISTS audio_source_channels        integer,
  ADD COLUMN IF NOT EXISTS audio_source_bytes           integer;
SQL
  then
    echo "post-merge: song audio-specs migration ok on $label"
  else
    echo "post-merge: WARNING — song audio-specs migration failed on $label (continuing)"
  fi
}
migrate_song_audio_specs dev  "${DATABASE_URL:-}"
migrate_song_audio_specs prod "${PROD_DATABASE_URL:-}"

# Task #326 — Preview hide (inverted) + optional sunrise auto-unhide.
# Every track is previewable by default; admin only flips
# `preview_hidden=true` to embargo a single track. `preview_hidden_until`
# is the optional sunrise — a lazy sweep in storage clears the flag
# once it passes. Additive nullable columns; safe to re-run.
migrate_song_preview_hide() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping song preview-hide migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS preview_hidden       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_hidden_until timestamp;
SQL
  then
    echo "post-merge: song preview-hide migration ok on $label"
  else
    echo "post-merge: WARNING — song preview-hide migration failed on $label (continuing)"
  fi
}
migrate_song_preview_hide dev  "${DATABASE_URL:-}"
migrate_song_preview_hide prod "${PROD_DATABASE_URL:-}"

# Task #335 — sell mode + physical format on albums. Drives the two-step
# creation flow, the adaptive Path-to-press at the top of the album page,
# and the new visual Sell-tab quote flow. Additive nullable columns; the
# backfill maps every existing album to `direct` with the closest format
# we can infer from the legacy `type` so nothing 500s when the Sell tab
# opens. Safe to re-run.
migrate_album_sell_mode() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album sell-mode migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS sell_mode             text,
  ADD COLUMN IF NOT EXISTS physical_format       text,
  ADD COLUMN IF NOT EXISTS sell_quote_locked_at  timestamp;
UPDATE albums
   SET sell_mode = 'direct'
 WHERE sell_mode IS NULL;
UPDATE albums
   SET physical_format = CASE
     WHEN type = 'LP'  THEN 'single_lp'
     WHEN type = 'EP'  THEN 'seven_inch'
     WHEN type = 'Duo' THEN 'seven_inch'
     ELSE                   'seven_inch'
   END
 WHERE physical_format IS NULL
   AND sell_mode = 'direct';
SQL
  then
    echo "post-merge: album sell-mode migration ok on $label"
  else
    echo "post-merge: WARNING — album sell-mode migration failed on $label (continuing)"
  fi
}
migrate_album_sell_mode dev  "${DATABASE_URL:-}"
migrate_album_sell_mode prod "${PROD_DATABASE_URL:-}"
