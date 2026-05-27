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

# Task #364 — songs.mux_last_error captures the human-readable reason
# from a failed Mux ingest (e.g. "invalid_input · could not download
# the asset"). Schema declares it; drizzle-kit push has been unreliable
# on additive song columns historically (see albums-schema-drift.md),
# so we pre-create on both DBs to keep the publish dev→prod diff empty
# and prevent /api/admin/mux-status from 500'ing on a freshly-cloned dev.
migrate_songs_mux_last_error() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping songs.mux_last_error migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE songs ADD COLUMN IF NOT EXISTS mux_last_error text;
SQL
  then
    echo "post-merge: songs.mux_last_error migration ok on $label"
  else
    echo "post-merge: WARNING — songs.mux_last_error migration failed on $label (continuing)"
  fi
}
migrate_songs_mux_last_error dev  "${DATABASE_URL:-}"
migrate_songs_mux_last_error prod "${PROD_DATABASE_URL:-}"

# Task #370 — Persist the Mux auto-retry ladder on the song row so the
# BACKFILL_MAX_ATTEMPTS cap survives server restarts. Without these
# columns the backfill sweep falls back to an in-memory Map and every
# deploy grants every errored master another full round of retries.
# Pre-create on both DBs to keep the publish dev→prod diff empty and
# stop the boot backfill from 500'ing on a freshly-cloned dev.
migrate_songs_mux_retry_ladder() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping songs.mux_retry_count migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS mux_retry_count   integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mux_last_retry_at timestamp;
SQL
  then
    echo "post-merge: songs.mux_retry_count migration ok on $label"
  else
    echo "post-merge: WARNING — songs.mux_retry_count migration failed on $label (continuing)"
  fi
}
migrate_songs_mux_retry_ladder dev  "${DATABASE_URL:-}"
migrate_songs_mux_retry_ladder prod "${PROD_DATABASE_URL:-}"

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

# Task #471 — Quickprinter capability + platform-default GoodDeed
# vendor routing + per-paper-size printing ladders. Idempotent on both
# DBs so a fresh-clone dev never 500s the Sell panel after this merge
# and the publish dev→prod diff stays empty. Backfills Hoover Printing
# as the seed Quickprinter and copies its existing `tiers_json` into
# the Letter ladder of `size_ladders_json`.
migrate_task_471_quickprinter() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-471 migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_quickprinter boolean NOT NULL DEFAULT false;
ALTER TABLE vendor_gooddeed_services
  ADD COLUMN IF NOT EXISTS size_ladders_json jsonb;
ALTER TABLE payout_settings
  ADD COLUMN IF NOT EXISTS default_print_vendor_id     varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_hologram_vendor_id  varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_insertion_vendor_id varchar REFERENCES vendors(id) ON DELETE SET NULL;
-- Seed Hoover Printing as the Quickprinter and copy its existing
-- printing tiers into the Letter ladder. Match by case-insensitive
-- name so "Hoover Printing" / "Hoover" both land. No-op when the
-- row doesn't exist.
UPDATE vendors
   SET is_quickprinter = true, is_maker = false
 WHERE lower(name) LIKE 'hoover%'
   AND is_quickprinter = false;
UPDATE vendor_gooddeed_services s
   SET size_ladders_json = jsonb_build_object('letter', s.tiers_json)
  FROM vendors v
 WHERE s.vendor_id = v.id
   AND s.service = 'printing'
   AND v.is_quickprinter = true
   AND s.size_ladders_json IS NULL
   AND s.tiers_json IS NOT NULL;
-- Seed the platform default Printing vendor to Hoover if unset.
UPDATE payout_settings
   SET default_print_vendor_id = v.id
  FROM vendors v
 WHERE payout_settings.id = 'default'
   AND payout_settings.default_print_vendor_id IS NULL
   AND v.is_quickprinter = true
   AND lower(v.name) LIKE 'hoover%';
SQL
  then
    echo "post-merge: task-471 quickprinter migration ok on $label"
  else
    echo "post-merge: WARNING — task-471 quickprinter migration failed on $label (continuing)"
  fi
}
migrate_task_471_quickprinter dev  "${DATABASE_URL:-}"
migrate_task_471_quickprinter prod "${PROD_DATABASE_URL:-}"

# Task #481 — payout_settings platform-default GoodDeed vendor columns.
# Same three columns the Task #471 block above tries to add, but split
# into their own transactional block so they don't get rolled back when
# the rest of the #471 migration fails on a DB that's missing the
# vendor_gooddeed_services table (the whole BEGIN/COMMIT rolls back as
# one unit; that's exactly how both dev and prod ended up without these
# columns even though the #471 block "ran"). shared/schema.ts depends
# on them for every payout_settings query, so missing them 500s the
# album editor save and the Platform Pricing page.
migrate_payout_settings_vendor_defaults() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping payout_settings vendor-defaults migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE payout_settings
  ADD COLUMN IF NOT EXISTS default_print_vendor_id     varchar,
  ADD COLUMN IF NOT EXISTS default_hologram_vendor_id  varchar,
  ADD COLUMN IF NOT EXISTS default_insertion_vendor_id varchar;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_settings_default_print_vendor_id_vendors_id_fk') THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_print_vendor_id_vendors_id_fk
      FOREIGN KEY (default_print_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_settings_default_hologram_vendor_id_vendors_id_fk') THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_hologram_vendor_id_vendors_id_fk
      FOREIGN KEY (default_hologram_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_settings_default_insertion_vendor_id_vendors_id_fk') THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_insertion_vendor_id_vendors_id_fk
      FOREIGN KEY (default_insertion_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END
$$;
COMMIT;
SQL
  then
    echo "post-merge: payout_settings vendor-defaults migration ok on $label"
  else
    echo "post-merge: WARNING — payout_settings vendor-defaults migration failed on $label (continuing)"
  fi
}
migrate_payout_settings_vendor_defaults dev  "${DATABASE_URL:-}"
migrate_payout_settings_vendor_defaults prod "${PROD_DATABASE_URL:-}"

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

# Task #363 — press turnaround is now an inclusive week range (min/max)
# instead of a raw day count. Additive ALTERs on both DBs so the
# publish dev→prod diff stays empty and a fresh-clone dev never 500s
# the admin Presses panel on its first save. Legacy `turnaround_days`
# is kept on the row so existing values aren't lost.
migrate_manufacturer_turnaround_weeks() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping manufacturer turnaround-weeks migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS turnaround_weeks_min integer,
  ADD COLUMN IF NOT EXISTS turnaround_weeks_max integer;
SQL
  then
    echo "post-merge: manufacturer turnaround-weeks migration ok on $label"
  else
    echo "post-merge: WARNING — manufacturer turnaround-weeks migration failed on $label (continuing)"
  fi
}
migrate_manufacturer_turnaround_weeks dev  "${DATABASE_URL:-}"
migrate_manufacturer_turnaround_weeks prod "${PROD_DATABASE_URL:-}"

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

# Task #429 — Anticipated track count for Publishing estimate before
# any masters are uploaded. Additive nullable column on `albums`; NULL
# means "fall back to the live song count". Pre-create on both DBs so
# the publish dev→prod diff stays empty and the Sell tab never 500s on
# a fresh-clone dev that hasn't run db:push.
migrate_album_anticipated_track_count() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping anticipated_track_count migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS anticipated_track_count integer;
SQL
  then
    echo "post-merge: anticipated_track_count migration ok on $label"
  else
    echo "post-merge: WARNING — anticipated_track_count migration failed on $label (continuing)"
  fi
}
migrate_album_anticipated_track_count dev  "${DATABASE_URL:-}"
migrate_album_anticipated_track_count prod "${PROD_DATABASE_URL:-}"

# Task #350 — Invite tree + multi-level referrals.
#   1. people.can_invite_ambassadors — per-person flag NPO partners
#      toggle on a contact to grant them the ambassador invite verb.
#   2. artist_referrals — per-album (referrer, invitee, album) row with
#      swap state and freeze-at-first-sale stamp.
#   3. press_invited_albums — project-scoped press → invited-artist
#      album link (no payout; the press's report rolls up units here).
#   4. referral_funding_config — singleton row holding the $1.50
#      invitee-charity bonus flag (default OFF).
#
# All additive / idempotent. Safe to re-run on both DBs.
migrate_invite_tree_v1() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping invite-tree v1 migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS can_invite_ambassadors boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS artist_referrals (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_person_id  varchar NOT NULL,
  invitee_person_id   varchar NOT NULL,
  album_id            varchar,
  swap_state          text    NOT NULL DEFAULT 'referrer_keeps_full',
  pre_elected_at      timestamp,
  frozen_at           timestamp,
  created_at          timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS artist_referrals_pair_album_uniq
  ON artist_referrals (referrer_person_id, invitee_person_id, COALESCE(album_id, ''));
CREATE INDEX IF NOT EXISTS artist_referrals_invitee_idx
  ON artist_referrals (invitee_person_id);

CREATE TABLE IF NOT EXISTS press_invited_albums (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id           varchar NOT NULL,
  invitee_person_id  varchar NOT NULL,
  album_id           varchar NOT NULL,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS press_invited_albums_press_album_uniq
  ON press_invited_albums (press_id, album_id);
CREATE INDEX IF NOT EXISTS press_invited_albums_press_idx
  ON press_invited_albums (press_id);

CREATE TABLE IF NOT EXISTS referral_funding_config (
  id                              varchar PRIMARY KEY DEFAULT 'singleton',
  invitee_charity_bonus_enabled   boolean NOT NULL DEFAULT false,
  updated_by_user_id              varchar,
  updated_at                      timestamp NOT NULL DEFAULT now()
);
INSERT INTO referral_funding_config (id) VALUES ('singleton')
  ON CONFLICT (id) DO NOTHING;
SQL
  then
    echo "post-merge: invite-tree v1 migration ok on $label"
  else
    echo "post-merge: WARNING — invite-tree v1 migration failed on $label (continuing)"
  fi
}
migrate_invite_tree_v1 dev  "${DATABASE_URL:-}"
migrate_invite_tree_v1 prod "${PROD_DATABASE_URL:-}"

# Task #354 — Referral-credit payout columns + organization payout owner.
# Adds the stamps the batched payout job (server/referralPayouts.ts) writes
# back ("paid" status, transfer id, paid_at, resolved payout owner). All
# additive / idempotent.
migrate_referral_payouts() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping referral-payouts migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE referral_credits
  ADD COLUMN IF NOT EXISTS payout_transfer_id text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamp,
  ADD COLUMN IF NOT EXISTS payout_owner_kind  text,
  ADD COLUMN IF NOT EXISTS payout_owner_id    varchar,
  ADD COLUMN IF NOT EXISTS payout_error       text,
  ADD COLUMN IF NOT EXISTS payout_run_id      varchar;
CREATE INDEX IF NOT EXISTS referral_credits_status_idx
  ON referral_credits (status);
CREATE INDEX IF NOT EXISTS referral_credits_payout_run_idx
  ON referral_credits (payout_run_id) WHERE payout_run_id IS NOT NULL;
SQL
  then
    echo "post-merge: referral-payouts migration ok on $label"
  else
    echo "post-merge: WARNING — referral-payouts migration failed on $label (continuing)"
  fi
}
migrate_referral_payouts dev  "${DATABASE_URL:-}"
migrate_referral_payouts prod "${PROD_DATABASE_URL:-}"

# Task #351 — Team invites + per-user permission overrides + claimed-
# Person review queue. All additive / idempotent:
#   1. admin_invites: invite_role + target_person_id + pre_flighted_album_id
#      + review_status (default 'not_required') + review audit columns.
#      Drives Identity/Manager/Team team invites.
#   2. partner_permissions: edit_credits_and_gear boolean (default
#      false). Used by Team invites to scope band members to credits
#      + gear edits without touching commerce.
#   3. partner_permission_overrides: per-(scope_kind, scope_id, user_id,
#      verb) granted/denied row. Powers the God-View matrix on a
#      Person — a super-admin can pin one verb on/off for one user
#      without touching scope-wide defaults.
#
# Pre-create on both DBs so the publish dev→prod diff stays empty and
# /api/admin/invites + /api/admin/people/:id/team never 500 on a
# fresh-clone dev DB.
migrate_team_invites() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping team-invites migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS invite_role            text,
  ADD COLUMN IF NOT EXISTS target_person_id       varchar,
  ADD COLUMN IF NOT EXISTS pre_flighted_album_id  varchar,
  ADD COLUMN IF NOT EXISTS review_status          text    NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id    varchar,
  ADD COLUMN IF NOT EXISTS reviewed_at            timestamp,
  ADD COLUMN IF NOT EXISTS review_note            text;

ALTER TABLE partner_permissions
  ADD COLUMN IF NOT EXISTS edit_credits_and_gear  boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS partner_permission_overrides (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind          text    NOT NULL,
  scope_id            varchar NOT NULL,
  user_id             varchar NOT NULL,
  verb                text    NOT NULL,
  granted             boolean NOT NULL,
  updated_by_user_id  varchar,
  updated_at          timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_permission_overrides_uniq
  ON partner_permission_overrides (scope_kind, scope_id, user_id, verb);
SQL
  then
    echo "post-merge: team-invites migration ok on $label"
  else
    echo "post-merge: WARNING — team-invites migration failed on $label (continuing)"
  fi
}
migrate_team_invites dev  "${DATABASE_URL:-}"
migrate_team_invites prod "${PROD_DATABASE_URL:-}"

# Task #366 — Backfill turnaround_weeks_min/max for hand-added presses
# still on the legacy turnaround_days value. Mirrors deriveWeeksFromDays
# in client/src/lib/pressTurnaround.ts. Idempotent: only touches rows
# where both week columns are NULL and a day count exists.
backfill_press_turnaround_weeks() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press-turnaround backfill on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
UPDATE manufacturers
   SET turnaround_weeks_min = GREATEST(1, GREATEST(1, ROUND(turnaround_days::numeric / 7))::int - 1),
       turnaround_weeks_max = GREATEST(1, ROUND(turnaround_days::numeric / 7))::int + 1
 WHERE turnaround_weeks_min IS NULL
   AND turnaround_weeks_max IS NULL
   AND turnaround_days IS NOT NULL;
SQL
  then
    echo "post-merge: press-turnaround backfill ok on $label"
  else
    echo "post-merge: WARNING — press-turnaround backfill failed on $label (continuing)"
  fi
}
backfill_press_turnaround_weeks dev  "${DATABASE_URL:-}"
backfill_press_turnaround_weeks prod "${PROD_DATABASE_URL:-}"

# Task #375 — Reconcile the Hellbender press catalog to the 6 real
# color groups published on hellbendervinyl.com/pages/custom-vinyl
# (Black / House Mix / Translucent Colors / Clear Colors / Metallic
# Colors / Opaque Colors). Drops the legacy 3-tier shape ("Standard
# color" / "Regrind mix") so the boot-time seed in
# server/pressCatalog.ts re-materializes the new shape (the seed is
# the source of truth — this SQL is the belt-and-suspenders kick that
# lets prod converge on merge without a manual SQL pass). Safe to
# re-run: only matches the dead tier names, leaves the new ones alone.
reconcile_hellbender_catalog() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping hellbender-catalog reconcile on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
DELETE FROM press_color_tiers
 WHERE press_id IN (SELECT id FROM manufacturers WHERE domain = 'hellbendervinyl.com')
   AND name IN ('Standard color', 'Regrind mix');
SQL
  then
    echo "post-merge: hellbender-catalog reconcile ok on $label"
  else
    echo "post-merge: WARNING — hellbender-catalog reconcile failed on $label (continuing)"
  fi
}
reconcile_hellbender_catalog dev  "${DATABASE_URL:-}"
reconcile_hellbender_catalog prod "${PROD_DATABASE_URL:-}"

# Task #394 — profile_photos: drop the bogus user_id→users.id FK, add
# the new photo_url column, and make the legacy data_url nullable.
#
# `user_id` legitimately holds either a `users.id` (admin/partner) or a
# `customer_users.id` (fan), same loose-FK pattern as `auth_tokens` and
# `user_albums`. The leftover FK blocks fan photo uploads with a 500
# whenever the constraint is enforced (prod, or a freshly-cloned dev),
# and the publish dev→prod diff will keep re-adding it from drifted dev
# DBs, so we DROP IF EXISTS idempotently on every merge.
#
# `photo_url` stores the object-storage `/objects/uploads/<id>` URL.
# `data_url` stays around (nullable) so existing inline base64 avatars
# in prod keep rendering until users replace them.
migrate_profile_photos_v2() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping profile_photos v2 migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS profile_photos (
  user_id    varchar PRIMARY KEY,
  photo_url  text,
  data_url   text,
  updated_at timestamp DEFAULT now()
);
ALTER TABLE profile_photos
  DROP CONSTRAINT IF EXISTS profile_photos_user_id_users_id_fk;
ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE profile_photos
  ALTER COLUMN data_url DROP NOT NULL;
COMMIT;
SQL
  then
    echo "post-merge: profile_photos v2 migration ok on $label"
  else
    echo "post-merge: WARNING — profile_photos v2 migration failed on $label (continuing)"
  fi
}
migrate_profile_photos_v2 dev  "${DATABASE_URL:-}"
migrate_profile_photos_v2 prod "${PROD_DATABASE_URL:-}"

# Task #395 — Loose-FK on playlists.user_id + server-side fan favorites.
#
#   1. `playlists.user_id` no longer carries a `.references(users.id)` in the
#      Drizzle schema: fan playlists write a `customer_users.id` here, and the
#      enforced FK to `users` 500'd every fan playlist create. Same pattern as
#      `user_albums.user_id` and the old `auth_tokens.user_id`. The publish
#      dev→prod diff will keep trying to re-add the constraint, so sweep it
#      off both DBs every merge (idempotent).
#
#   2. `song_favorites` + `artist_favorites` back the heart-on-song and star-
#      on-artist UI. Server-side so they survive logout / device switch.
#      `user_id` is a loose FK (no REFERENCES) for the same dual-table reason
#      as playlists. Composite PK enforces idempotent add. song_favorites
#      keeps a real FK to `songs(id)` so deleted songs don't leave dangling
#      hearts; artist_favorites keys by artist name (no stable artist id yet).
#
# Safe to re-run on already-migrated DBs (every statement is IF EXISTS /
# IF NOT EXISTS) and is pre-applied on both DBs so the publish flow's
# dev→prod diff stays empty.
migrate_fan_favorites() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping fan-favorites migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS playlists
  DROP CONSTRAINT IF EXISTS playlists_user_id_users_id_fk;

CREATE TABLE IF NOT EXISTS song_favorites (
  user_id    varchar NOT NULL,
  song_id    varchar NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS artist_favorites (
  user_id     varchar NOT NULL,
  artist_name text    NOT NULL,
  created_at  timestamp DEFAULT now(),
  PRIMARY KEY (user_id, artist_name)
);
COMMIT;
SQL
  then
    echo "post-merge: fan-favorites migration ok on $label"
  else
    echo "post-merge: WARNING — fan-favorites migration failed on $label (continuing)"
  fi
}
migrate_fan_favorites dev  "${DATABASE_URL:-}"
migrate_fan_favorites prod "${PROD_DATABASE_URL:-}"

# Task #397 — album_skus.display_name. Optional artist-edited label for
# the format row in the Sell panel (empty falls back to the format
# label on read). Pre-create on both DBs so the publish dev→prod diff
# stays empty and fresh-clone dev never 500s the PUT /skus/:format
# route on the new column.
migrate_album_skus_display_name() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_skus.display_name migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS display_name text;
SQL
  then
    echo "post-merge: album_skus.display_name migration ok on $label"
  else
    echo "post-merge: WARNING — album_skus.display_name migration failed on $label (continuing)"
  fi
}
migrate_album_skus_display_name dev  "${DATABASE_URL:-}"
migrate_album_skus_display_name prod "${PROD_DATABASE_URL:-}"

# Task #398 — gogoods.com legacy import mapping. The importer wrote
# `legacy_gogoods_id` onto `albums` / `songs` / `people` / `customer_users`
# / `orders` in prod (845 rows) but never landed in shared/schema.ts or
# dev DB. Without these columns + their partial unique indexes on dev,
# the publish dev→prod diff wanted to DROP all five columns and wipe
# the mapping that Tasks #400 / #402 / #403 / #404 depend on. Now in
# shared/schema.ts; this step keeps both DBs aligned across future
# fresh-clones and merges. Idempotent.
migrate_legacy_gogoods_id() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping legacy_gogoods_id migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE albums         ADD COLUMN IF NOT EXISTS legacy_gogoods_id text;
ALTER TABLE songs          ADD COLUMN IF NOT EXISTS legacy_gogoods_id text;
ALTER TABLE people         ADD COLUMN IF NOT EXISTS legacy_gogoods_id text;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS legacy_gogoods_id text;
ALTER TABLE orders         ADD COLUMN IF NOT EXISTS legacy_gogoods_id text;
CREATE UNIQUE INDEX IF NOT EXISTS albums_legacy_gogoods_id_uniq
  ON albums(legacy_gogoods_id) WHERE legacy_gogoods_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS songs_legacy_gogoods_id_uniq
  ON songs(legacy_gogoods_id) WHERE legacy_gogoods_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_legacy_gogoods_id_uniq
  ON people(legacy_gogoods_id) WHERE legacy_gogoods_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_users_legacy_gogoods_id_uniq
  ON customer_users(legacy_gogoods_id) WHERE legacy_gogoods_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_legacy_gogoods_id_uniq
  ON orders(legacy_gogoods_id) WHERE legacy_gogoods_id IS NOT NULL;
COMMIT;
SQL
  then
    echo "post-merge: legacy_gogoods_id migration ok on $label"
  else
    echo "post-merge: WARNING — legacy_gogoods_id migration failed on $label (continuing)"
  fi
}
migrate_legacy_gogoods_id dev  "${DATABASE_URL:-}"
migrate_legacy_gogoods_id prod "${PROD_DATABASE_URL:-}"

# Task #423 — snapshot album track count on saved SKUs so the
# Publishing line (trackCount × mechanicals) doesn't silently shift
# when songs are added/removed after Save. The task agent applied
# the column to dev only ("drizzle push is interactive in this repo")
# and didn't land a post-merge step, so prod's Sell tab 500'd on the
# select. Idempotent.
migrate_album_skus_track_count() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_skus.cost_snapshot_track_count migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS cost_snapshot_track_count integer;
SQL
  then
    echo "post-merge: album_skus.cost_snapshot_track_count migration ok on $label"
  else
    echo "post-merge: WARNING — album_skus.cost_snapshot_track_count migration failed on $label (continuing)"
  fi
}
migrate_album_skus_track_count dev  "${DATABASE_URL:-}"
migrate_album_skus_track_count prod "${PROD_DATABASE_URL:-}"

# Task #400 — Welcome-back flow for imported gogoods.com fans.
# Adds:
#   * customer_users.onboarded_at         — stamp after 3-screen onboarding
#   * customer_users.welcome_email_sent_at — single-shot guard for wave-1 mail
#   * customer_users.merged_into_id        — soft-delete pointer (audit + auth)
#   * welcome_back_tokens                  — 30-day single-use sign-in tokens
#   * welcome_back_email_sends             — per-recipient send log (sent/failed)
#   * customer_merges                      — audit of fan-initiated merges
# Mirrors shared/schema.ts. Idempotent — safe to run on both dev and prod
# regardless of which migrations have already landed.
migrate_welcome_back() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping welcome-back migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS onboarded_at         timestamp;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamp;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS merged_into_id        varchar;
CREATE TABLE IF NOT EXISTS welcome_back_tokens (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  token_hash   text    NOT NULL UNIQUE,
  expires_at   timestamp NOT NULL,
  consumed_at  timestamp,
  created_at   timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS welcome_back_tokens_customer_idx
  ON welcome_back_tokens(customer_id);
CREATE TABLE IF NOT EXISTS welcome_back_email_sends (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  email        text    NOT NULL,
  status       text    NOT NULL,
  reason       text,
  created_at   timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS welcome_back_email_sends_customer_idx
  ON welcome_back_email_sends(customer_id);
CREATE TABLE IF NOT EXISTS customer_merges (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_id         varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  losing_id            varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  losing_email         text    NOT NULL,
  moved_order_count    integer NOT NULL DEFAULT 0,
  moved_album_count    integer NOT NULL DEFAULT 0,
  moved_playlist_count integer NOT NULL DEFAULT 0,
  triggered_by         text    NOT NULL DEFAULT 'customer',
  created_at           timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_merges_surviving_idx
  ON customer_merges(surviving_id);
-- Task #400 follow-up — store the exact moved row ids so admin undo
-- reverses precisely the same set instead of guessing by timestamp.
ALTER TABLE customer_merges
  ADD COLUMN IF NOT EXISTS moved_order_ids    text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS moved_album_ids    text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS moved_playlist_ids text[] NOT NULL DEFAULT '{}'::text[];
COMMIT;
SQL
  then
    echo "post-merge: welcome-back migration ok on $label"
  else
    echo "post-merge: WARNING — welcome-back migration failed on $label (continuing)"
  fi
}
migrate_welcome_back dev  "${DATABASE_URL:-}"
migrate_welcome_back prod "${PROD_DATABASE_URL:-}"

# Task #433 — per-row Lock affordance on physical-good SKUs. Mirrors the
# album-level `albums.sell_quote_locked_at` semantics: NULL = unlocked
# (editable), non-NULL = locked (read-only on the artist Sell panel).
# Server only allows unlock until the album's pressing_order_requests row
# reaches status='approved'. Idempotent.
migrate_album_skus_locked_at() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_skus.locked_at migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS locked_at timestamp;
SQL
  then
    echo "post-merge: album_skus.locked_at migration ok on $label"
  else
    echo "post-merge: WARNING — album_skus.locked_at migration failed on $label (continuing)"
  fi
}
migrate_album_skus_locked_at dev  "${DATABASE_URL:-}"
migrate_album_skus_locked_at prod "${PROD_DATABASE_URL:-}"

# Task #440 — albums.is_prepping lifecycle gate. New GoodTunes shells
# created via "+ Add Album" land in Prepping so the Released tab stops
# filling up with "Unknown artist / 0 tracks" placeholder rows. Default
# false keeps every existing row visible as Released on rollout. Pre-
# create on both DBs so the publish dev→prod diff stays empty and a
# fresh-clone dev doesn't 500 on /api/admin/albums creates.
migrate_albums_is_prepping() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping albums.is_prepping migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS is_prepping boolean NOT NULL DEFAULT false;
SQL
  then
    echo "post-merge: albums.is_prepping migration ok on $label"
  else
    echo "post-merge: WARNING — albums.is_prepping migration failed on $label (continuing)"
  fi
}
migrate_albums_is_prepping dev  "${DATABASE_URL:-}"
migrate_albums_is_prepping prod "${PROD_DATABASE_URL:-}"

# Task #461 — `instruments.source_url` keeps the original product/listing
# page each piece of gear was scraped from (Carter Vintage page,
# martinguitar.com model page, etc). Drives the fan-side "View original
# listing" link and the admin one-click "Refetch image" recovery. Pre-
# create on both DBs so the publish dev→prod diff stays empty and a
# fresh-clone dev never 500s the gear endpoints. Idempotent.
migrate_instruments_source_url() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping instruments.source_url migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS source_url text;
SQL
  then
    echo "post-merge: instruments.source_url migration ok on $label"
  else
    echo "post-merge: WARNING — instruments.source_url migration failed on $label (continuing)"
  fi
}
migrate_instruments_source_url dev  "${DATABASE_URL:-}"
migrate_instruments_source_url prod "${PROD_DATABASE_URL:-}"

# Task #467 — Full press-catalog table chain. Parent tables
# (press_formats, press_color_tiers, press_colors) were missing on
# both DBs because Task #467's migration only created the new leaf
# tables (press_jackets, press_tier_jacket_ladders) and assumed the
# parents already existed from an older drizzle push that never
# actually ran on prod or dev. Pre-create the whole chain so the
# publish dev→prod diff stays empty (see [Dev↔Prod publish-time drift])
# and the dependent FK creates succeed. Idempotent.
migrate_press_catalog() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_catalog migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS press_formats (
  id        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id  varchar NOT NULL,
  format    text    NOT NULL,
  position  integer NOT NULL DEFAULT 0,
  CONSTRAINT press_formats_press_format_uniq UNIQUE (press_id, format)
);
CREATE TABLE IF NOT EXISTS press_color_tiers (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id     varchar NOT NULL,
  format       text    NOT NULL,
  name         text    NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  price_ladder jsonb   NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS press_colors (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id           varchar NOT NULL REFERENCES press_color_tiers(id) ON DELETE CASCADE,
  name              text    NOT NULL,
  swatch_hex        text,
  swatch_image_url  text,
  position          integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS press_jackets (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id    varchar NOT NULL,
  name        text    NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false,
  CONSTRAINT press_jackets_press_name_uniq UNIQUE (press_id, name)
);
CREATE TABLE IF NOT EXISTS press_tier_jacket_ladders (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id      varchar NOT NULL REFERENCES press_color_tiers(id) ON DELETE CASCADE,
  jacket_id    varchar NOT NULL REFERENCES press_jackets(id)     ON DELETE CASCADE,
  price_ladder jsonb   NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT press_tier_jacket_ladder_uniq UNIQUE (tier_id, jacket_id)
);
SQL
  then
    echo "post-merge: press_catalog migration ok on $label"
  else
    echo "post-merge: WARNING — press_catalog migration failed on $label (continuing)"
  fi
}
migrate_press_catalog dev  "${DATABASE_URL:-}"
migrate_press_catalog prod "${PROD_DATABASE_URL:-}"

# Task #475 — Soft-delete columns. Every admin-deletable table grew a
# trio of nullable columns (deleted_at, deleted_by_user_id,
# deleted_via_parent_id) so Delete becomes a soft-flip surfaced on
# /admin/trash for 30 days; a daily sweeper hard-deletes anything past
# the TTL. Idempotent — re-running this on a DB that already has the
# columns is a no-op.
migrate_soft_delete() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping soft_delete migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'albums','songs','album_videos','album_photos','album_credits',
    'people','band_members','instruments','labels','vendors',
    'manufacturers','fulfillment_partners','track_writers','track_performers'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I
         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
         ADD COLUMN IF NOT EXISTS deleted_by_user_id VARCHAR,
         ADD COLUMN IF NOT EXISTS deleted_via_parent_id VARCHAR', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (deleted_at) WHERE deleted_at IS NOT NULL',
      t || '_deleted_at_idx', t);
  END LOOP;
END $$;
COMMIT;
SQL
  then
    echo "post-merge: soft_delete migration ok on $label"
  else
    echo "post-merge: WARNING — soft_delete migration failed on $label (continuing)"
  fi
}
migrate_soft_delete dev  "${DATABASE_URL:-}"
migrate_soft_delete prod "${PROD_DATABASE_URL:-}"

# Task #489 — Structured partner addresses. Adds a jsonb snapshot
# column alongside the existing free-text `location` (and, for
# fulfillment partners, `shipping_address`) on every partner table.
# The free-text column stays source of truth for display; the
# struct backs filters/reports. Additive nullable columns only, so
# this is safe to re-run and never touches existing data.
migrate_partner_address_snapshots() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping partner-address snapshots migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE labels                ADD COLUMN IF NOT EXISTS location_address         jsonb;
ALTER TABLE vendors               ADD COLUMN IF NOT EXISTS location_address         jsonb;
ALTER TABLE manufacturers         ADD COLUMN IF NOT EXISTS location_address         jsonb;
ALTER TABLE fulfillment_partners  ADD COLUMN IF NOT EXISTS location_address         jsonb;
ALTER TABLE fulfillment_partners  ADD COLUMN IF NOT EXISTS shipping_address_struct  jsonb;
-- Task #517 — Places-picked structured snapshot for the remaining two
-- partner address surfaces: NPO mailing address and Person shipping
-- address. Free-text columns above stay the display source of truth;
-- these jsonb snapshots back filters/reports/mailing pipelines.
ALTER TABLE organizations         ADD COLUMN IF NOT EXISTS mailing_address_struct   jsonb;
ALTER TABLE people                ADD COLUMN IF NOT EXISTS shipping_address_struct  jsonb;
SQL
  then
    echo "post-merge: partner-address snapshots migration ok on $label"
  else
    echo "post-merge: WARNING — partner-address snapshots migration failed on $label (continuing)"
  fi
}
migrate_partner_address_snapshots dev  "${DATABASE_URL:-}"
migrate_partner_address_snapshots prod "${PROD_DATABASE_URL:-}"

# Task #490 — Address columns for artist comp shipments + NPO partner mail.
# `people.shipping_address` carries the formatted address typed/picked via
# the shared Places-autocomplete field on the AdminPerson Identity panel;
# `organizations.mailing_address` is the parallel column for NPO partners on
# AdminNonProfit. Both are nullable text (matches vendors/labels `location`),
# so the publish dev→prod diff stays empty whether one side has the column
# yet or not. Idempotent ADD COLUMN IF NOT EXISTS — safe on every merge.
migrate_partner_addresses() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping partner_addresses migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE people         ADD COLUMN IF NOT EXISTS shipping_address text;
ALTER TABLE organizations  ADD COLUMN IF NOT EXISTS mailing_address  text;
SQL
  then
    echo "post-merge: partner_addresses migration ok on $label"
  else
    echo "post-merge: WARNING — partner_addresses migration failed on $label (continuing)"
  fi
}
migrate_partner_addresses dev  "${DATABASE_URL:-}"
migrate_partner_addresses prod "${PROD_DATABASE_URL:-}"

# Task #530 — Fan recents + recent searches (server-backed history for the
# new Recents tab + Search landing). Loose FK to customer_users.id (same
# pattern as song_favorites / user_albums). Idempotent; safe on every merge.
migrate_fan_recents() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping fan_recents migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS fan_recents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL,
  entity_kind text NOT NULL,
  entity_id varchar NOT NULL,
  title text NOT NULL,
  subtitle text,
  thumb_url text,
  href text NOT NULL,
  last_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fan_recents_user_lastat_idx ON fan_recents (user_id, last_at);
CREATE UNIQUE INDEX IF NOT EXISTS fan_recents_user_kind_entity_uniq ON fan_recents (user_id, entity_kind, entity_id);

CREATE TABLE IF NOT EXISTS fan_recent_searches (
  user_id varchar NOT NULL,
  query_norm text NOT NULL,
  display_query text NOT NULL,
  last_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_norm)
);
CREATE INDEX IF NOT EXISTS fan_recent_searches_user_lastat_idx ON fan_recent_searches (user_id, last_at);
-- Task #530 code-review pass: entity-tapped recent-search rows live
-- in this same table (decoupled from fan_recents, which is the
-- "everything opened" Recents tab). Nullable so legacy text-only
-- rows stay valid.
ALTER TABLE fan_recent_searches
  ADD COLUMN IF NOT EXISTS entity_kind text,
  ADD COLUMN IF NOT EXISTS entity_id varchar,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS thumb_url text,
  ADD COLUMN IF NOT EXISTS href text;
SQL
  then
    echo "post-merge: fan_recents migration ok on $label"
  else
    echo "post-merge: WARNING — fan_recents migration failed on $label (continuing)"
  fi
}
migrate_fan_recents dev  "${DATABASE_URL:-}"
migrate_fan_recents prod "${PROD_DATABASE_URL:-}"

# Task #527 — Stripe Connect transfer earmarking for press invoice
# captures. Adds nullable columns to `albums` so the invoice POST
# handler can stamp the resulting transfer id / amount / timestamp /
# invoice-identity key, and surface the last failure reason on the
# Payouts subtab if Stripe rejected the transfer. Schema-only —
# additive, idempotent.
migrate_press_invoice_transfer() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_invoice_transfer migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_transfer_id           text;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_transferred_at        timestamp;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_transfer_amount_cents integer;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_transfer_error        text;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_transfer_invoice_key  text;
SQL
  then
    echo "post-merge: press_invoice_transfer migration ok on $label"
  else
    echo "post-merge: WARNING — press_invoice_transfer migration failed on $label (continuing)"
  fi
}
migrate_press_invoice_transfer dev  "${DATABASE_URL:-}"
migrate_press_invoice_transfer prod "${PROD_DATABASE_URL:-}"

# Task #522 — Press portal schema. Default-press wiring on labels/people/
# admin_invites, per-tier masters_prep_cost_cents, press_switch_history,
# the press_invoice_* / masters_* / fulfillment_heads_up_* columns on
# albums, and the rename of the legacy `press_invoice_captured_at` /
# `press_invoice_billed_outside` to `press_invoice_uploaded_at` /
# `press_invoice_outside_system`. All-NULL on prod at rename time, so
# the renames are safe. Everything else is additive + idempotent.
migrate_press_portal() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_portal migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS press_switch_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_kind text NOT NULL,
  customer_id varchar NOT NULL,
  album_id varchar,
  from_press_id varchar,
  to_press_id varchar,
  reason text,
  switched_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp,
  deleted_by_user_id varchar,
  deleted_via_parent_id varchar
);
ALTER TABLE labels             ADD COLUMN IF NOT EXISTS default_press_id varchar;
ALTER TABLE people             ADD COLUMN IF NOT EXISTS default_press_id varchar;
ALTER TABLE admin_invites      ADD COLUMN IF NOT EXISTS default_press_id varchar;
ALTER TABLE press_color_tiers  ADD COLUMN IF NOT EXISTS masters_prep_cost_cents integer NOT NULL DEFAULT 0;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS masters_triggered_at           timestamp;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS masters_approved_by_artist_at  timestamp;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_url              text;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_total_cents      integer;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_note             text;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS fulfillment_heads_up_sent_at   timestamp;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS fulfillment_heads_up_qty       integer;
-- Rename legacy → new column names if the legacy ones still exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='albums' AND column_name='press_invoice_captured_at') THEN
    ALTER TABLE albums RENAME COLUMN press_invoice_captured_at TO press_invoice_uploaded_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='albums' AND column_name='press_invoice_billed_outside') THEN
    ALTER TABLE albums RENAME COLUMN press_invoice_billed_outside TO press_invoice_outside_system;
  END IF;
END $$;
-- Ensure the new column names exist (fresh DBs that never had the legacy ones).
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_uploaded_at    timestamp;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS press_invoice_outside_system boolean NOT NULL DEFAULT false;
-- Backfill any pre-existing NULLs and enforce NOT NULL on outside_system.
UPDATE albums SET press_invoice_outside_system = false WHERE press_invoice_outside_system IS NULL;
ALTER TABLE albums ALTER COLUMN press_invoice_outside_system SET NOT NULL;
ALTER TABLE albums ALTER COLUMN press_invoice_outside_system SET DEFAULT false;
SQL
  then
    echo "post-merge: press_portal migration ok on $label"
  else
    echo "post-merge: WARNING — press_portal migration failed on $label (continuing)"
  fi
}
migrate_press_portal dev  "${DATABASE_URL:-}"
migrate_press_portal prod "${PROD_DATABASE_URL:-}"

# Task #538 — Phone verification (verify-once-reuse-everywhere SMS OTP).
# Adds phone_e164 + phone_verified_at to both users and customer_users,
# plus the phone_otp_codes scratch table (one in-flight code per user,
# 10-minute TTL, 5 attempts, scrypt-hashed). Pre-create on both DBs so
# the publish dev→prod diff stays empty and a fresh-clone dev never
# 500s the gift / payouts gating endpoints on first call.
migrate_task_538_phone_verification() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-538 phone-verification migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_e164         varchar,
  ADD COLUMN IF NOT EXISTS phone_verified_at  timestamp;
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS phone_e164         varchar,
  ADD COLUMN IF NOT EXISTS phone_verified_at  timestamp;
CREATE TABLE IF NOT EXISTS phone_otp_codes (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_kind     text     NOT NULL,
  user_id       varchar  NOT NULL,
  phone_e164    varchar  NOT NULL,
  code_hash     text     NOT NULL,
  attempts      integer  NOT NULL DEFAULT 0,
  ip            varchar,
  expires_at    timestamp NOT NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS phone_otp_codes_user_uniq
  ON phone_otp_codes (user_kind, user_id);
SQL
  then
    echo "post-merge: task-538 phone-verification migration ok on $label"
  else
    echo "post-merge: WARNING — task-538 phone-verification migration failed on $label (continuing)"
  fi
}
migrate_task_538_phone_verification dev  "${DATABASE_URL:-}"
migrate_task_538_phone_verification prod "${PROD_DATABASE_URL:-}"

# Task #537 — Finish-signup flow for OAuth-minted fan accounts. Adds
# nullable columns to customer_users (handle, contact_email,
# contact_phone, signup_completed_at) + the case-insensitive partial
# unique index on `handle`. Creates `reserved_handles` and seeds it
# with verified-artist usernames pulled from `people` (idempotent ON
# CONFLICT DO NOTHING). Backfills `signup_completed_at` on every
# existing row to `created_at` so legacy + password-signup fans never
# see the new screen. Additive + idempotent — safe on every merge.
migrate_finish_signup() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping finish_signup migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS handle               text,
  ADD COLUMN IF NOT EXISTS contact_email        text,
  ADD COLUMN IF NOT EXISTS contact_phone        text,
  ADD COLUMN IF NOT EXISTS signup_completed_at  timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS customer_users_handle_lower_uniq
  ON customer_users (lower(handle))
  WHERE handle IS NOT NULL;
-- Every existing fan was created before this flow shipped; treat them
-- as already-onboarded so the redirect never fires on them.
UPDATE customer_users
   SET signup_completed_at = COALESCE(created_at, now())
 WHERE signup_completed_at IS NULL;
CREATE TABLE IF NOT EXISTS reserved_handles (
  handle      text PRIMARY KEY,
  reason      text,
  created_at  timestamp DEFAULT now()
);
-- Seed with every artist-style People row's name so a fan can't grab
-- a known artist's handle before that artist's team has claimed it.
-- `people` carries no slug/verified column today, so we derive a
-- handle from `name` (lowercased, stripped to a–z 0–9 . _ -) and
-- skip anything that doesn't fit the 3–30-char fan-handle vocabulary.
-- The Spotify-driven importer that expands this list is a separate
-- task; this gives us a sensible starting baseline.
INSERT INTO reserved_handles (handle, reason)
SELECT lower(regexp_replace(name, '[^A-Za-z0-9._-]+', '', 'g')) AS h, 'people-row'
  FROM people
 WHERE name IS NOT NULL
   AND deleted_at IS NULL
   AND length(regexp_replace(name, '[^A-Za-z0-9._-]+', '', 'g')) BETWEEN 3 AND 30
ON CONFLICT (handle) DO NOTHING;
INSERT INTO reserved_handles (handle, reason) VALUES
  ('taylorswift',   'top-N seed'),
  ('beyonce',       'top-N seed'),
  ('drake',         'top-N seed'),
  ('rihanna',       'top-N seed'),
  ('kanyewest',     'top-N seed'),
  ('adele',         'top-N seed'),
  ('billieeilish',  'top-N seed'),
  ('arianagrande',  'top-N seed'),
  ('edsheeran',     'top-N seed'),
  ('bts',           'top-N seed'),
  ('badbunny',      'top-N seed'),
  ('theweeknd',     'top-N seed'),
  ('brunomars',     'top-N seed'),
  ('coldplay',      'top-N seed'),
  ('u2',            'top-N seed'),
  ('radiohead',     'top-N seed'),
  ('metallica',     'top-N seed'),
  ('beatles',       'top-N seed'),
  ('rollingstones', 'top-N seed'),
  ('pinkfloyd',     'top-N seed'),
  ('zeppelin',      'top-N seed'),
  ('ledzeppelin',   'top-N seed'),
  ('queen',         'top-N seed'),
  ('davidbowie',    'top-N seed'),
  ('madonna',       'top-N seed'),
  ('prince',        'top-N seed'),
  ('michaeljackson','top-N seed'),
  ('nickcarter',    'verified-artist'),
  ('backstreetboys','top-N seed'),
  ('compassrecords','top-N seed'),
  ('goodtunes',     'platform'),
  ('admin',         'platform'),
  ('support',       'platform'),
  ('help',          'platform')
ON CONFLICT (handle) DO NOTHING;
COMMIT;
SQL
  then
    echo "post-merge: finish_signup migration ok on $label"
  else
    echo "post-merge: WARNING — finish_signup migration failed on $label (continuing)"
  fi
}
migrate_finish_signup dev  "${DATABASE_URL:-}"
migrate_finish_signup prod "${PROD_DATABASE_URL:-}"

# Task #543 — Held payout earmarks. Bill must release every Stripe
# Connect transfer from /admin/payouts-release before it actually
# fires. Schema-only — additive, idempotent — pre-create on both
# DBs so the publish dev→prod diff stays empty and a fresh-clone dev
# never 500s /api/admin/payout-earmarks.
migrate_payout_earmarks() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping payout_earmarks migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS payout_earmarks (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind         text      NOT NULL,
  source_ref          text      NOT NULL,
  album_id            varchar,
  owner_kind          text      NOT NULL,
  owner_id            varchar   NOT NULL,
  amount_cents        integer   NOT NULL,
  currency            text      NOT NULL DEFAULT 'usd',
  status              text      NOT NULL DEFAULT 'held',
  held_at             timestamp NOT NULL DEFAULT now(),
  released_at         timestamp,
  released_by_user_id varchar,
  rejected_at         timestamp,
  rejected_by_user_id varchar,
  rejection_reason    text,
  stripe_transfer_id  text,
  transfer_error      text,
  notes               text
);
CREATE INDEX IF NOT EXISTS payout_earmarks_status_idx ON payout_earmarks(status);
CREATE INDEX IF NOT EXISTS payout_earmarks_owner_idx  ON payout_earmarks(owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS payout_earmarks_source_idx ON payout_earmarks(source_kind, source_ref);
SQL
  then
    echo "post-merge: payout_earmarks migration ok on $label"
  else
    echo "post-merge: WARNING — payout_earmarks migration failed on $label (continuing)"
  fi
}
migrate_payout_earmarks dev  "${DATABASE_URL:-}"
migrate_payout_earmarks prod "${PROD_DATABASE_URL:-}"

# Task #546 — Artist-to-artist invites: pre-seeded "earmarked folks"
# list super-admin uses to feed the artist dashboard's invite
# suggestions. Pre-create on both DBs so a fresh-clone dev never 500s
# the new endpoints and the publish dev→prod diff stays empty.
migrate_earmarked_artists() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping earmarked_artists migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS earmarked_artists (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  email              text NOT NULL UNIQUE,
  notes              text,
  added_by_user_id   varchar,
  added_at           timestamp DEFAULT now(),
  invited_at         timestamp,
  invited_invite_id  varchar
);
CREATE INDEX IF NOT EXISTS earmarked_artists_invited_idx ON earmarked_artists(invited_at);
SQL
  then
    echo "post-merge: earmarked_artists migration ok on $label"
  else
    echo "post-merge: WARNING — earmarked_artists migration failed on $label (continuing)"
  fi
}
migrate_earmarked_artists dev  "${DATABASE_URL:-}"
migrate_earmarked_artists prod "${PROD_DATABASE_URL:-}"
# Task #551 — Partial unique index on (album_id, good_deed_number) so
# two paid orders for the same album can never share a printed
# sequence number, even under a concurrent webhook race that beats the
# MAX+1 read. The mint helper in commerce.ts catches the 23505 and
# retries with a fresh MAX+1 lookup. Idempotent CREATE INDEX IF NOT
# EXISTS on both DBs so a fresh-clone dev never reintroduces the bug
# and the publish dev→prod diff stays empty.
migrate_orders_good_deed_unique() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping orders good_deed unique-index migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE UNIQUE INDEX IF NOT EXISTS orders_album_good_deed_number_uniq
  ON orders (album_id, good_deed_number)
  WHERE good_deed_number IS NOT NULL;
SQL
  then
    echo "post-merge: orders good_deed unique-index migration ok on $label"
  else
    echo "post-merge: WARNING — orders good_deed unique-index migration failed on $label (continuing)"
  fi
}
migrate_orders_good_deed_unique dev  "${DATABASE_URL:-}"
migrate_orders_good_deed_unique prod "${PROD_DATABASE_URL:-}"

# Task #579 — Booklet add-on artwork. The new `booklet` AlbumAddon
# kind carries its own print-ready cover URL (separate from the
# album jacket). Add the column on both DBs so a fresh-clone dev
# never 500s the addon PUT and the publish dev→prod diff stays empty.
migrate_album_addons_booklet() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_addons booklet migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE IF EXISTS album_addons
  ADD COLUMN IF NOT EXISTS artwork_url text;
SQL
  then
    echo "post-merge: album_addons booklet migration ok on $label"
  else
    echo "post-merge: WARNING — album_addons booklet migration failed on $label (continuing)"
  fi
}
migrate_album_addons_booklet dev  "${DATABASE_URL:-}"
migrate_album_addons_booklet prod "${PROD_DATABASE_URL:-}"

# Task #549 — Multi-quantity web checkout. Adds the per-copy
# entitlement table (`order_copies`) and a nullable `copy_id` column on
# `signed_cert_certificates`, swapping the old `unique(order_id)`
# constraint for two partial unique indexes so legacy single-cert
# orders (copy_id NULL) and per-copy orders (copy_id set) coexist
# without a data migration. Idempotent on both DBs.
migrate_task_549_multi_quantity() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-549 multi-quantity migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS order_copies (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            varchar NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  album_id            varchar NOT NULL,
  position            integer NOT NULL DEFAULT 0,
  format              text    NOT NULL,
  signed_cert         boolean NOT NULL DEFAULT false,
  format_price_cents  integer NOT NULL,
  addon_price_cents   integer NOT NULL DEFAULT 0,
  good_deed_number    integer,
  vinyl_color         text,
  jacket_upgrade      text,
  gift_id             varchar,
  created_at          timestamp DEFAULT now()
);
ALTER TABLE order_copies ADD COLUMN IF NOT EXISTS album_id varchar;
-- Backfill album_id for any rows written before this column existed,
-- then enforce NOT NULL.
UPDATE order_copies oc SET album_id = o.album_id
  FROM orders o WHERE o.id = oc.order_id AND oc.album_id IS NULL;
ALTER TABLE order_copies ALTER COLUMN album_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_copies_order_position_uniq
  ON order_copies (order_id, position);
-- Per-album partial unique on good_deed_number — same protection
-- model as orders.good_deed_number_uniq; lets withRetryOnGoodDeed
-- Collision recover from cross-order races on per-copy numbers.
CREATE UNIQUE INDEX IF NOT EXISTS order_copies_album_good_deed_number_uniq
  ON order_copies (album_id, good_deed_number)
  WHERE good_deed_number IS NOT NULL;

ALTER TABLE signed_cert_certificates
  ADD COLUMN IF NOT EXISTS copy_id varchar;
-- The original `.unique()` on order_id auto-named the constraint
-- `signed_cert_certificates_order_id_unique` (drizzle default) or
-- `signed_cert_certificates_order_id_key` (pg default). Drop whichever
-- exists so we can replace it with two partial unique indexes.
ALTER TABLE signed_cert_certificates
  DROP CONSTRAINT IF EXISTS signed_cert_certificates_order_id_unique;
ALTER TABLE signed_cert_certificates
  DROP CONSTRAINT IF EXISTS signed_cert_certificates_order_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS signed_cert_certs_order_legacy_uniq
  ON signed_cert_certificates (order_id)
  WHERE copy_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS signed_cert_certs_order_copy_uniq
  ON signed_cert_certificates (order_id, copy_id)
  WHERE copy_id IS NOT NULL;
COMMIT;
SQL
  then
    echo "post-merge: task-549 multi-quantity migration ok on $label"
  else
    echo "post-merge: WARNING — task-549 multi-quantity migration failed on $label (continuing)"
  fi
}
migrate_task_549_multi_quantity dev  "${DATABASE_URL:-}"
migrate_task_549_multi_quantity prod "${PROD_DATABASE_URL:-}"

# Task #541 — vinyl track reorder + per-side length warnings.
# albums.vinyl_format + songs.vinyl_side/vinyl_order. Originally
# applied to dev by hand; prod missed it and crashed Admin Albums +
# Fan Orders on the shared `SELECT albums.*` until backfilled.
migrate_vinyl_order() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping vinyl_order migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums ADD COLUMN IF NOT EXISTS vinyl_format text;
ALTER TABLE songs  ADD COLUMN IF NOT EXISTS vinyl_side   text;
ALTER TABLE songs  ADD COLUMN IF NOT EXISTS vinyl_order  integer;
SQL
  then
    echo "post-merge: vinyl_order migration ok on $label"
  else
    echo "post-merge: WARNING — vinyl_order migration failed on $label (continuing)"
  fi
}
migrate_vinyl_order dev  "${DATABASE_URL:-}"
migrate_vinyl_order prod "${PROD_DATABASE_URL:-}"
