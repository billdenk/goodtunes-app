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
