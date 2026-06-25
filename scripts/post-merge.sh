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

# Task #1036 — Unified identity P1: memberships table (one account → many
# scopes). shared/schema.ts declares it + two PARTIAL unique indexes
# (drizzle-kit push has been unreliable on additive DDL — see
# albums-schema-drift.md), so we hand-apply the canonical DDL on BOTH dev
# and prod to keep the publish dev→prod diff empty. Idempotent.
migrate_memberships() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping memberships migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS memberships (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              varchar NOT NULL,
  role                 text    NOT NULL,
  scope_kind           text,
  scope_id             varchar,
  sub_role             text,
  permission_overrides jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_god_uniq
  ON memberships (user_id) WHERE scope_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_scope_uniq
  ON memberships (user_id, scope_kind, scope_id) WHERE scope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);
COMMIT;
SQL
  then
    echo "post-merge: memberships migration ok on $label"
  else
    echo "post-merge: WARNING — memberships migration failed on $label (continuing)"
  fi
}
migrate_memberships dev  "${DATABASE_URL:-}"
migrate_memberships prod "${PROD_DATABASE_URL:-}"

# Task #1734 — "Get Notified" waitlist for pre-launch releases. shared/schema.ts
# declares release_notify_signups; drizzle-kit push is unreliable on additive
# DDL, so hand-apply the canonical CREATE TABLE on BOTH dev and prod to keep
# the schema-drift guard green and the publish dev→prod diff empty. Idempotent.
migrate_release_notify_signups() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping release_notify_signups migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS release_notify_signups (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  email            text    NOT NULL,
  customer_user_id varchar,
  source           text,
  created_at       timestamp NOT NULL DEFAULT now(),
  notified_at      timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS release_notify_album_email_uniq
  ON release_notify_signups (album_id, email);
COMMIT;
SQL
  then
    echo "post-merge: release_notify_signups migration ok on $label"
  else
    echo "post-merge: WARNING — release_notify_signups migration failed on $label (continuing)"
  fi
}
migrate_release_notify_signups dev  "${DATABASE_URL:-}"
migrate_release_notify_signups prod "${PROD_DATABASE_URL:-}"

# Task #1994 — fan "Request this rig" capture. shared/schema.ts declares
# rig_quote_requests; hand-apply the canonical CREATE TABLE on BOTH dev and
# prod to keep the schema-drift guard green and the publish dev→prod diff
# empty. Idempotent.
migrate_rig_quote_requests() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping rig_quote_requests migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS rig_quote_requests (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  rig_id           varchar REFERENCES rigs(id) ON DELETE SET NULL,
  rig_name         text    NOT NULL,
  song_id          varchar REFERENCES songs(id) ON DELETE SET NULL,
  stock_state      text,
  name             text,
  email            text    NOT NULL,
  phone            text,
  message          text,
  customer_user_id varchar,
  source           text,
  created_at       timestamp NOT NULL DEFAULT now(),
  handled_at       timestamp
);
CREATE INDEX IF NOT EXISTS rig_quote_requests_rig_idx ON rig_quote_requests (rig_id);
CREATE INDEX IF NOT EXISTS rig_quote_requests_created_idx ON rig_quote_requests (created_at);
COMMIT;
SQL
  then
    echo "post-merge: rig_quote_requests migration ok on $label"
  else
    echo "post-merge: WARNING — rig_quote_requests migration failed on $label (continuing)"
  fi
}
migrate_rig_quote_requests dev  "${DATABASE_URL:-}"
migrate_rig_quote_requests prod "${PROD_DATABASE_URL:-}"

# Task #2109 — admin "Confirm a completed PDF matches the press specs".
# shared/schema.ts declares completed_template_checks (one row per album);
# hand-apply the canonical CREATE TABLE on BOTH dev and prod to keep the
# schema-drift guard green and the publish dev→prod diff empty. Idempotent.
migrate_completed_template_checks() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping completed_template_checks migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS completed_template_checks (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id   varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  vendor_id  text    NOT NULL,
  config     jsonb   NOT NULL,
  components jsonb   NOT NULL DEFAULT '[]'::jsonb,
  status     text    NOT NULL DEFAULT 'empty',
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS completed_template_checks_album_uniq ON completed_template_checks (album_id);
COMMIT;
SQL
  then
    echo "post-merge: completed_template_checks migration ok on $label"
  else
    echo "post-merge: WARNING — completed_template_checks migration failed on $label (continuing)"
  fi
}
migrate_completed_template_checks dev  "${DATABASE_URL:-}"
migrate_completed_template_checks prod "${PROD_DATABASE_URL:-}"

# Task #1036 — TRUE ONE-TIME backfill: give every existing account exactly
# ONE membership reproducing its current users.role / role_scope_id +
# folded partner_permission_overrides. Marker-guarded in
# post_merge_data_backfills so later membership writes (setUserRole's
# dual-write, override mirrors) are never clobbered on a subsequent merge.
# Role normalization mirrors server/auth/roles.ts#normalizeRole EXACTLY
# (org→non_profit; unknown→super_admin) so the DB read path matches the
# synth fallback byte-for-byte. role_scope_id is preserved verbatim.
backfill_task_1036_memberships() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1036 memberships backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1036_memberships'
  ) THEN
    WITH resolved AS (
      SELECT
        u.id AS user_id,
        u.role_scope_id,
        CASE
          WHEN u.role = 'org' THEN 'non_profit'
          WHEN u.role IN ('super_admin','admin','label','artist','manufacturer','fulfillment','non_profit','vendor') THEN u.role
          ELSE 'super_admin'
        END AS role_norm
      FROM users u
    ),
    scoped AS (
      SELECT
        r.user_id,
        r.role_norm,
        r.role_scope_id,
        CASE
          WHEN r.role_norm IN ('label','artist','manufacturer','fulfillment','non_profit','vendor') THEN r.role_norm
          ELSE NULL
        END AS scope_kind
      FROM resolved r
    ),
    overrides AS (
      SELECT user_id, scope_kind, scope_id, jsonb_object_agg(verb, granted) AS map
      FROM partner_permission_overrides
      GROUP BY user_id, scope_kind, scope_id
    )
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, permission_overrides)
    SELECT
      s.user_id, s.role_norm, s.scope_kind, s.role_scope_id,
      COALESCE(o.map, '{}'::jsonb)
    FROM scoped s
    LEFT JOIN overrides o
      ON o.user_id = s.user_id
     AND o.scope_kind = s.scope_kind
     AND o.scope_id = s.role_scope_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1036_memberships');

    RAISE NOTICE 'task-1036 backfill applied: % memberships seeded', v_count;
  ELSE
    RAISE NOTICE 'task-1036 backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1036 memberships backfill ok on $label"
    echo "$out" | grep -i 'task-1036' || true
  else
    echo "post-merge: WARNING — task-1036 memberships backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1036_memberships dev  "${DATABASE_URL:-}"
backfill_task_1036_memberships prod "${PROD_DATABASE_URL:-}"

# Task #2076 — ONE-TIME reconciliation of legacy GoGoods fans who got
# stranded in a fresh, empty OAuth account by a forced iOS re-auth
# (Apple "Hide My Email" mints a relay-mask `email` that never collides
# with the legacy real-email row, so the old callback created a NEW
# account instead of linking). For each such stranded duplicate we keep
# the LEGACY library row as the survivor — it already owns the collection
# + legacy_gogoods_id + QR provenance — and MOVE the OAuth identity onto
# it (performAccountMerge deliberately never moves identities, so the
# admin "Combine accounts" tool makes the OAuth holder the survivor; here
# we move the single identity row by hand to avoid migrating the whole
# legacy collection the other direction). Marker-guarded in
# post_merge_data_backfills so a later real merge / operator edit is never
# clobbered on a subsequent post-merge run. Dev clones carry no legacy
# rows so this no-ops there; the real work lands once on prod.
#
# Pairing is intentionally conservative: a LEGACY account (legacy_gogoods_id
# set, not merged, no real password, zero identities, owns >=1 user_albums)
# is matched to a STRANDED OAuth account (no legacy id, not merged, has a
# contact_email, has >=1 identity) only when the legacy login email equals
# the OAuth account's captured contact_email AND that email maps to exactly
# ONE legacy row and exactly ONE OAuth row (any ambiguity is skipped, left
# for the manual admin tool). All six side-effects run in one statement via
# data-modifying CTEs (always executed to completion), so the whole pass is
# atomic inside the surrounding transaction.
reconcile_task_2076_legacy_oauth() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-2076 legacy/oauth reconcile on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_pairs integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_2076_reconcile_legacy_oauth'
  ) THEN
    WITH pairs AS MATERIALIZED (
      WITH legacy AS (
        SELECT cu.id, lower(cu.email) AS real_email
        FROM customer_users cu
        WHERE cu.legacy_gogoods_id IS NOT NULL
          AND cu.merged_into_id IS NULL
          AND (cu.password IS NULL OR cu.password LIKE '!oauth-only:%')
          AND cu.email IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM customer_identities ci WHERE ci.user_id = cu.id)
          AND EXISTS (SELECT 1 FROM user_albums ua WHERE ua.user_id = cu.id)
      ),
      oauth_new AS (
        SELECT cu.id, lower(cu.contact_email) AS real_email
        FROM customer_users cu
        WHERE cu.legacy_gogoods_id IS NULL
          AND cu.merged_into_id IS NULL
          AND cu.contact_email IS NOT NULL
          AND cu.contact_email <> ''
          AND EXISTS (SELECT 1 FROM customer_identities ci WHERE ci.user_id = cu.id)
      ),
      candidates AS (
        SELECT l.id AS legacy_id, n.id AS oauth_id, l.real_email
        FROM legacy l
        JOIN oauth_new n ON n.real_email = l.real_email AND n.id <> l.id
      )
      SELECT c.legacy_id, c.oauth_id, c.real_email
      FROM candidates c
      WHERE NOT EXISTS (SELECT 1 FROM candidates d WHERE d.legacy_id = c.legacy_id AND d.oauth_id <> c.oauth_id)
        AND NOT EXISTS (SELECT 1 FROM candidates d WHERE d.oauth_id = c.oauth_id AND d.legacy_id <> c.legacy_id)
    ),
    mv_idents AS (
      UPDATE customer_identities ci
         SET user_id = p.legacy_id
        FROM pairs p
       WHERE ci.user_id = p.oauth_id
      RETURNING 1
    ),
    mv_albums AS (
      UPDATE user_albums ua
         SET user_id = p.legacy_id
        FROM pairs p
       WHERE ua.user_id = p.oauth_id
         AND NOT EXISTS (
           SELECT 1 FROM user_albums x
            WHERE x.user_id = p.legacy_id AND x.album_id = ua.album_id
         )
      RETURNING 1
    ),
    mv_orders AS (
      UPDATE orders o
         SET customer_id = p.legacy_id
        FROM pairs p
       WHERE o.customer_id = p.oauth_id
      RETURNING 1
    ),
    mv_playlists AS (
      UPDATE playlists pl
         SET user_id = p.legacy_id
        FROM pairs p
       WHERE pl.user_id = p.oauth_id
      RETURNING 1
    ),
    del_tokens AS (
      DELETE FROM auth_tokens a
        USING pairs p
       WHERE a.customer_user_id = p.oauth_id
      RETURNING 1
    ),
    audit AS (
      INSERT INTO customer_merges (surviving_id, losing_id, losing_email, triggered_by)
      SELECT p.legacy_id, p.oauth_id, COALESCE(cu.email, p.real_email), 'task_2076_reconcile'
      FROM pairs p
      JOIN customer_users cu ON cu.id = p.oauth_id
      RETURNING 1
    ),
    soft_del AS (
      UPDATE customer_users cu
         SET merged_into_id = p.legacy_id
        FROM pairs p
       WHERE cu.id = p.oauth_id
      RETURNING 1
    )
    SELECT count(*) INTO v_pairs FROM pairs;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_2076_reconcile_legacy_oauth');

    RAISE NOTICE 'task-2076 reconcile applied: % legacy/oauth pairs reconciled', v_pairs;
  ELSE
    RAISE NOTICE 'task-2076 reconcile already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-2076 legacy/oauth reconcile ok on $label"
    echo "$out" | grep -i 'task-2076' || true
  else
    echo "post-merge: WARNING — task-2076 legacy/oauth reconcile failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
reconcile_task_2076_legacy_oauth dev  "${DATABASE_URL:-}"
reconcile_task_2076_legacy_oauth prod "${PROD_DATABASE_URL:-}"

# Real fan shipping — schema. orders gains a base/markup/charged/band
# breakdown and a new shipping_rates rate-card table (one row per
# partner × destination × band). shared/schema.ts declares both; we
# hand-apply the canonical additive DDL on BOTH dev and prod so the
# schema-drift guard stays green on a freshly-cloned dev and the publish
# dev→prod diff stays empty. Idempotent (IF NOT EXISTS).
migrate_shipping_rates() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping shipping_rates migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS shipping_base_cents    integer,
  ADD COLUMN IF NOT EXISTS shipping_markup_cents  integer,
  ADD COLUMN IF NOT EXISTS shipping_charged_cents integer,
  ADD COLUMN IF NOT EXISTS shipping_band          text,
  -- Task #1629 — Stripe Tax: per-order computed sales tax (already part of
  -- total_cents; broken out for the /welcome receipt + email tax line).
  ADD COLUMN IF NOT EXISTS tax_cents              integer;
CREATE TABLE IF NOT EXISTS shipping_rates (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_partner_id varchar NOT NULL REFERENCES fulfillment_partners(id) ON DELETE CASCADE,
  destination            text NOT NULL,
  band                   text NOT NULL,
  base_cents             integer NOT NULL,
  markup_cents           integer NOT NULL DEFAULT 100,
  currency               text NOT NULL DEFAULT 'usd',
  source                 text,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rates_partner_dest_band_uniq
  ON shipping_rates (fulfillment_partner_id, destination, band);
COMMIT;
SQL
  then
    echo "post-merge: shipping_rates migration ok on $label"
  else
    echo "post-merge: WARNING — shipping_rates migration failed on $label (continuing)"
  fi
}
migrate_shipping_rates dev  "${DATABASE_URL:-}"
migrate_shipping_rates prod "${PROD_DATABASE_URL:-}"

# Digital GoodDeed cert paper size — orders.cert_paper_size lets a digital
# (synthetic-cert) owner flip US Letter ↔ A4 from the cert viewer. NULL =
# country-derived default. Declared in shared/schema.ts; hand-apply the
# additive DDL on BOTH dev and prod so the schema-drift guard stays green
# and the publish dev→prod diff stays empty. Idempotent (IF NOT EXISTS).
migrate_cert_paper_size() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping cert_paper_size migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS cert_paper_size text;
SQL
  then
    echo "post-merge: cert_paper_size migration ok on $label"
  else
    echo "post-merge: WARNING — cert_paper_size migration failed on $label (continuing)"
  fi
}
migrate_cert_paper_size dev  "${DATABASE_URL:-}"
migrate_cert_paper_size prod "${PROD_DATABASE_URL:-}"

# Task #2030 — associate a connected Shopify store with a GoodTunes label
# (shopify_stores.label_id). Stamped when the operator connects/attaches a
# store from the label's Shopify tab. Declared in shared/schema.ts; hand-
# apply the additive DDL on BOTH dev and prod so the schema-drift guard
# stays green and the publish dev→prod diff stays empty. Idempotent.
migrate_shopify_store_label() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping shopify_store_label migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE IF EXISTS shopify_stores
  ADD COLUMN IF NOT EXISTS label_id varchar
    REFERENCES labels(id) ON DELETE SET NULL;
SQL
  then
    echo "post-merge: shopify_store_label migration ok on $label"
  else
    echo "post-merge: WARNING — shopify_store_label migration failed on $label (continuing)"
  fi
}
migrate_shopify_store_label dev  "${DATABASE_URL:-}"
migrate_shopify_store_label prod "${PROD_DATABASE_URL:-}"

# Task #1976 — Odoo printer integration. orders.odoo_order_id (unique → a
# replayed push can't double-create) + orders.odoo_last_synced_at record the
# Odoo sale.order handoff and poll cursor; fulfillment_partners.is_odoo_printer
# designates the single partner wired to the Odoo instance. Declared in
# shared/schema.ts; hand-apply the additive DDL on BOTH dev and prod so the
# schema-drift guard stays green on a freshly-cloned dev and the publish
# dev→prod diff stays empty. Idempotent (IF NOT EXISTS).
migrate_odoo_printer() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping odoo_printer migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS odoo_order_id       text,
  ADD COLUMN IF NOT EXISTS odoo_last_synced_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS orders_odoo_order_id_unique
  ON orders (odoo_order_id);
ALTER TABLE IF EXISTS fulfillment_partners
  ADD COLUMN IF NOT EXISTS is_odoo_printer boolean NOT NULL DEFAULT false;
COMMIT;
SQL
  then
    echo "post-merge: odoo_printer migration ok on $label"
  else
    echo "post-merge: WARNING — odoo_printer migration failed on $label (continuing)"
  fi
}
migrate_odoo_printer dev  "${DATABASE_URL:-}"
migrate_odoo_printer prod "${PROD_DATABASE_URL:-}"

# Rig accessory inventory link. rig_accessories.instrument_id optionally links
# an accessory line to a catalog instrument so the Rig accessory editor works
# "the same as all other gear" (type-to-search the inventory + paste-a-URL
# import). Nullable + ON DELETE SET NULL (the `value` text snapshot keeps a
# deleted-instrument accessory renderable); legacy free-text accessories leave
# it null. Declared in shared/schema.ts; hand-apply the additive DDL on BOTH
# dev and prod so the schema-drift guard stays green on a freshly-cloned dev
# and the publish dev→prod diff stays empty. Idempotent (IF NOT EXISTS).
migrate_rig_accessory_instrument() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping rig_accessory_instrument migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE IF EXISTS rig_accessories
  ADD COLUMN IF NOT EXISTS instrument_id varchar
  REFERENCES instruments(id) ON DELETE SET NULL;
SQL
  then
    echo "post-merge: rig_accessory_instrument migration ok on $label"
  else
    echo "post-merge: WARNING — rig_accessory_instrument migration failed on $label (continuing)"
  fi
}
migrate_rig_accessory_instrument dev  "${DATABASE_URL:-}"
migrate_rig_accessory_instrument prod "${PROD_DATABASE_URL:-}"

# Task #1514 — legacy gogoods.com QR provenance bridge.
# user_albums.legacy_gogoods_collectible_id stamps the gogoods `collectible`
# bigserial id onto the owned copy so the resolver (GET /legacy/g/:code) can
# map an old printed QR code back to its current /g/:shortId provenance page.
# Declared in shared/schema.ts (column + partial-unique index); hand-apply the
# additive DDL on BOTH dev and prod so the schema-drift guard stays green on a
# freshly-cloned dev and the publish dev→prod diff stays empty. Idempotent
# (IF NOT EXISTS). The data backfill itself runs further below (marker-guarded).
migrate_gogoods_collectible_id() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping gogoods_collectible_id migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE IF EXISTS user_albums
  ADD COLUMN IF NOT EXISTS legacy_gogoods_collectible_id varchar;
CREATE UNIQUE INDEX IF NOT EXISTS user_albums_legacy_gogoods_collectible_uniq
  ON user_albums (legacy_gogoods_collectible_id);
SQL
  then
    echo "post-merge: gogoods_collectible_id migration ok on $label"
  else
    echo "post-merge: WARNING — gogoods_collectible_id migration failed on $label (continuing)"
  fi
}
migrate_gogoods_collectible_id dev  "${DATABASE_URL:-}"
migrate_gogoods_collectible_id prod "${PROD_DATABASE_URL:-}"
# Push notifications — device-token table. shared/schema.ts declares
# `push_devices` (one row per fan × installed app, keyed on the unique
# APNs/FCM token). Hand-apply the canonical additive DDL on BOTH dev and
# prod so the schema-drift guard stays green on a freshly-cloned dev and
# the publish dev→prod diff stays empty. Idempotent (IF NOT EXISTS).
migrate_push_devices() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping push_devices migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS push_devices (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  platform     text NOT NULL,
  token        text NOT NULL UNIQUE,
  created_at   timestamp DEFAULT now(),
  last_seen_at timestamp DEFAULT now(),
  deleted_at   timestamp
);
CREATE INDEX IF NOT EXISTS push_devices_customer_idx ON push_devices (customer_id);
COMMIT;
SQL
  then
    echo "post-merge: push_devices migration ok on $label"
  else
    echo "post-merge: WARNING — push_devices migration failed on $label (continuing)"
  fi
}
migrate_push_devices dev  "${DATABASE_URL:-}"
migrate_push_devices prod "${PROD_DATABASE_URL:-}"

# Publishing-payout settlement columns — `organizations.pay_to_org_id`
# (administered-by routing, e.g. Songs of Kaotic → Hipgnosis),
# `payout_settings.mechanical_rate_micros` (statutory $0.127/unit default),
# and `albums.mechanical_units_pressed` (operator-recorded pressing count, the
# settlement-basis fallback for runs pressed offline that never went through
# the in-app pressing_order_requests pipeline — e.g. Nick Carter's catalog).
# All three live in shared/schema.ts; apply here so the dev→prod publish diff
# stays empty and the schema-drift guard passes on both DBs. Idempotent.
migrate_publishing_payouts() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping publishing_payouts migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS organizations
  ADD COLUMN IF NOT EXISTS pay_to_org_id varchar;
ALTER TABLE IF EXISTS payout_settings
  ADD COLUMN IF NOT EXISTS mechanical_rate_micros integer NOT NULL DEFAULT 127000;
ALTER TABLE IF EXISTS albums
  ADD COLUMN IF NOT EXISTS mechanical_units_pressed integer;
COMMIT;
SQL
  then
    echo "post-merge: publishing_payouts migration ok on $label"
  else
    echo "post-merge: WARNING — publishing_payouts migration failed on $label (continuing)"
  fi
}
migrate_publishing_payouts dev  "${DATABASE_URL:-}"
migrate_publishing_payouts prod "${PROD_DATABASE_URL:-}"

# Nick Carter "Love Life Tragedy" mechanical publishing splits — loads the
# authoritative songwriter/publisher splits + administered-by routing + the
# 500-unit offline pressing count so the admin Publishing view settles the
# real mechanical liability ($1,777.99 across 18 payees) instead of $0. The
# data is prod-only (Nick's catalog never exists in dev), so the script
# self-gates: in dev it finds no in-scope songs and exits without writing.
# Idempotent + marker-guarded (post_merge_data_backfills) so a later operator
# edit to a split survives the next merge. Runs AFTER the column migration
# above (it writes albums.mechanical_units_pressed). Synchronous + fast
# (~80 rows); no backgrounding needed.
backfill_nick_publishing() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping nick-publishing backfill on $label (no URL set)"
    return 0
  fi
  if DATABASE_URL="$url" npx tsx scripts/backfill-nick-publishing.ts; then
    echo "post-merge: nick-publishing backfill ok on $label"
  else
    echo "post-merge: WARNING — nick-publishing backfill failed on $label (continuing)"
  fi
}
backfill_nick_publishing dev  "${DATABASE_URL:-}"
backfill_nick_publishing prod "${PROD_DATABASE_URL:-}"

# Task #1514 — legacy gogoods.com QR provenance bridge: stamp the gogoods
# `collectible` bigserial id onto each owned user_albums row so the resolver
# (GET /legacy/g/:code) can map an old printed QR code back to its current
# /g/:shortId provenance page. Reads the committed gogoods export zip, resolves
# legacy→live ids via the legacy_gogoods_id pointers, and only stamps rows
# whose collectible-id is still NULL. Self-gates: a fresh dev clone with no
# gogoods import finds nothing, writes nothing, and leaves the marker unset so
# it re-checks on a later merge. Idempotent + marker-guarded
# (post_merge_data_backfills) so operator edits survive future merges. Runs
# AFTER migrate_gogoods_collectible_id (needs the column).
backfill_gogoods_collectible_ids() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping gogoods-collectible-ids backfill on $label (no URL set)"
    return 0
  fi
  if DATABASE_URL="$url" npx tsx scripts/backfill-gogoods-collectible-ids.ts; then
    echo "post-merge: gogoods-collectible-ids backfill ok on $label"
  else
    echo "post-merge: WARNING — gogoods-collectible-ids backfill failed on $label (continuing)"
  fi
}
backfill_gogoods_collectible_ids dev  "${DATABASE_URL:-}"
backfill_gogoods_collectible_ids prod "${PROD_DATABASE_URL:-}"

# Hellbender "Splatter" 12" disc swatches — load Bill's authoritative 31-disc
# export into both Splatter Color tiers (12_lp + 12_double) so the SellPanel
# "Design your Package" picker renders real discs instead of an empty tier. The
# disc PNGs are committed (scripts/data/splatter-discs + manifest with resolved
# /objects URLs from the shared bucket), so a fresh clone reuses them without
# re-uploading. Self-gates: a clone without the Hellbender press or its Splatter
# tiers writes nothing and leaves the marker unset to re-check on a later merge.
# Idempotent + marker-guarded (post_merge_data_backfills) — does a SCOPED
# clean-replace (drops only the old psd:BONUS_VinylMockUp_Examples provisional
# rows) so operator renames/reprices/deletes survive future merges.
backfill_hellbender_splatter() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping hellbender-splatter backfill on $label (no URL set)"
    return 0
  fi
  if DATABASE_URL="$url" npx tsx scripts/seed-hellbender-splatter.ts; then
    echo "post-merge: hellbender-splatter backfill ok on $label"
  else
    echo "post-merge: WARNING — hellbender-splatter backfill failed on $label (continuing)"
  fi
}
backfill_hellbender_splatter dev  "${DATABASE_URL:-}"
backfill_hellbender_splatter prod "${PROD_DATABASE_URL:-}"

# Memphis Record Pressing FULL public color catalog (315 colors / 16 categories
# from memphisrecordpressing.com/all-vinyl-colors) mirrored into the Memphis
# press tiers. Idempotent + marker-guarded (post_merge_data_backfills /
# memphis_mrp_color_catalog_v1): creates the 9 missing specialty tiers per vinyl
# format (cloning price_ladder + jacket ladders from that format's "Metallic
# Blends" tier so they price like Metallic until Bill edits them), then ADDITIVELY
# fills/high-res-upgrades the existing tiers — never deletes, so operator extras
# (Decepticons, Glow Green, EcoMix) are kept. High-res photos mirror into the
# shared bucket ONCE; the resolved /objects URLs persist in the committed manifest
# (scripts/data/memphis-colors.json) so dev + prod + fresh clones reuse them
# instead of re-uploading. Self-gates: a clone without the Memphis press writes
# nothing and leaves the marker unset to re-check on a later merge.
backfill_memphis_colors() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping memphis-colors backfill on $label (no URL set)"
    return 0
  fi
  if DATABASE_URL="$url" npx tsx scripts/seed-memphis-colors.ts; then
    echo "post-merge: memphis-colors backfill ok on $label"
  else
    echo "post-merge: WARNING — memphis-colors backfill failed on $label (continuing)"
  fi
}
backfill_memphis_colors dev  "${DATABASE_URL:-}"
backfill_memphis_colors prod "${PROD_DATABASE_URL:-}"

# Gibson sub-brand fold — every product on gibson.com is Gibson (Bill's call:
# "anything with gibson.com as the URL is Gibson"). The Add-gear scraper used
# to promote any gibson.com brand string that wasn't exactly "Gibson" into its
# own sub-brand maker (Task #603), which mis-fired on Gibson's own product
# LINES — "Gibson Custom" and "Gibson Mod™ Collection" each became a separate
# maker card alongside Gibson, and Epiphone too. The route fix removes
# gibson.com from SUB_BRAND_PARENT_HOSTS so no new sub-brands are minted; this
# one-time backfill folds the EXISTING sub-brands back into the single Gibson
# maker: repoint their gear (instruments.maker_vendor_id + instrument_vendors),
# de-duping attachments, then soft-delete the empty sub-brand rows. Targeted by
# domain (not hardcoded ids) so it also catches any sub-brands scraped before
# this deploys. The Gibson rows are prod-only, so dev self-gates (no top-level
# gibson.com vendor → nothing to fold, marker left unset to re-check later).
# Marker-guarded (post_merge_data_backfills) so a deliberately re-created
# gibson.com sub-brand later is never clobbered on a subsequent merge.
backfill_gibson_fold_subbrands() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping gibson-fold backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_parent  varchar;
  v_instr   integer := 0;
  v_dedupe  integer := 0;
  v_repoint integer := 0;
  v_deleted integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name = 'gibson_fold_subbrands') THEN
    RAISE NOTICE 'gibson-fold already applied — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_parent FROM vendors
   WHERE domain = 'gibson.com' AND parent_vendor_id IS NULL AND deleted_at IS NULL
   ORDER BY created_at NULLS FIRST
   LIMIT 1;

  IF v_parent IS NULL THEN
    RAISE NOTICE 'gibson-fold: no top-level gibson.com vendor — nothing to fold (marker left unset)';
    RETURN;
  END IF;

  -- Repoint each gibson.com sub-brand's gear to the one Gibson maker.
  UPDATE instruments SET maker_vendor_id = v_parent
   WHERE maker_vendor_id IN (
     SELECT id FROM vendors
      WHERE domain = 'gibson.com' AND parent_vendor_id IS NOT NULL
        AND deleted_at IS NULL AND id <> v_parent
   );
  GET DIAGNOSTICS v_instr = ROW_COUNT;

  -- Drop sub-brand attachments that would duplicate an existing Gibson one.
  DELETE FROM instrument_vendors iv
   WHERE iv.vendor_id IN (
     SELECT id FROM vendors
      WHERE domain = 'gibson.com' AND parent_vendor_id IS NOT NULL
        AND deleted_at IS NULL AND id <> v_parent
   )
   AND EXISTS (
     SELECT 1 FROM instrument_vendors g
      WHERE g.instrument_id = iv.instrument_id AND g.vendor_id = v_parent
   );
  GET DIAGNOSTICS v_dedupe = ROW_COUNT;

  -- Repoint the remaining sub-brand attachments to Gibson.
  UPDATE instrument_vendors SET vendor_id = v_parent
   WHERE vendor_id IN (
     SELECT id FROM vendors
      WHERE domain = 'gibson.com' AND parent_vendor_id IS NOT NULL
        AND deleted_at IS NULL AND id <> v_parent
   );
  GET DIAGNOSTICS v_repoint = ROW_COUNT;

  -- Soft-delete the now-empty sub-brand maker rows.
  UPDATE vendors SET deleted_at = now()
   WHERE domain = 'gibson.com' AND parent_vendor_id IS NOT NULL
     AND deleted_at IS NULL AND id <> v_parent;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO post_merge_data_backfills (name) VALUES ('gibson_fold_subbrands');

  RAISE NOTICE 'gibson-fold applied: % instruments repointed, % attachments deduped, % attachments repointed, % sub-brands removed',
    v_instr, v_dedupe, v_repoint, v_deleted;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: gibson-fold backfill ok on $label"
    echo "$out" | grep -i 'gibson-fold' || true
  else
    echo "post-merge: WARNING — gibson-fold backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_gibson_fold_subbrands dev  "${DATABASE_URL:-}"
backfill_gibson_fold_subbrands prod "${PROD_DATABASE_URL:-}"

# Real fan shipping — seed Spinney Media's April-2026 rate card. base_cents
# is Spinney's own published rate; markup_cents is the flat $1.00 GoodTunes
# margin kept separate so the fudge stays visible. US + 7 named countries
# carry their own band1/2/3 rate; "INTL" is the catch-all average for every
# other destination. Marker-guarded so operator edits to the rate card are
# never clobbered on a later merge. Spinney partner id is fixed.
backfill_spinney_shipping_rates() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping spinney rate-card seed on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
  v_spinney constant text := '389bd449-b548-4fee-8e3a-4a5be9191a6a';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'spinney_rate_card_april_2026'
  ) AND EXISTS (
    SELECT 1 FROM fulfillment_partners WHERE id = v_spinney
  ) THEN
    INSERT INTO shipping_rates (fulfillment_partner_id, destination, band, base_cents, markup_cents, source)
    VALUES
      (v_spinney,'US','band1',687,100,'spinney_chart_april_2026'),
      (v_spinney,'US','band2',762,100,'spinney_chart_april_2026'),
      (v_spinney,'US','band3',837,100,'spinney_chart_april_2026'),
      (v_spinney,'CA','band1',1367,100,'spinney_chart_april_2026'),
      (v_spinney,'CA','band2',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'CA','band3',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'GB','band1',1613,100,'spinney_chart_april_2026'),
      (v_spinney,'GB','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'GB','band3',2061,100,'spinney_chart_april_2026'),
      (v_spinney,'FR','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'FR','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'FR','band3',2483,100,'spinney_chart_april_2026'),
      (v_spinney,'DE','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'DE','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'DE','band3',2483,100,'spinney_chart_april_2026'),
      (v_spinney,'HN','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'HN','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'HN','band3',2483,100,'spinney_chart_april_2026'),
      (v_spinney,'JP','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'JP','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'JP','band3',2483,100,'spinney_chart_april_2026'),
      (v_spinney,'MX','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'MX','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'MX','band3',2483,100,'spinney_chart_april_2026'),
      (v_spinney,'INTL','band1',1671,100,'spinney_chart_april_2026'),
      (v_spinney,'INTL','band2',2077,100,'spinney_chart_april_2026'),
      (v_spinney,'INTL','band3',2483,100,'spinney_chart_april_2026')
    ON CONFLICT (fulfillment_partner_id, destination, band) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO post_merge_data_backfills (name) VALUES ('spinney_rate_card_april_2026');
    RAISE NOTICE 'spinney rate-card seed applied: % rows', v_count;
  ELSE
    RAISE NOTICE 'spinney rate-card seed already applied (or partner missing) — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: spinney rate-card seed ok on $label"
    echo "$out" | grep -i 'spinney' || true
  else
    echo "post-merge: WARNING — spinney rate-card seed failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_spinney_shipping_rates dev  "${DATABASE_URL:-}"
backfill_spinney_shipping_rates prod "${PROD_DATABASE_URL:-}"

# Task #1460 — Auto-grant the "Love Life Tragedy (Bonus)" album to every
# existing owner of the Nick Carter "Love Life Tragedy (Double Album)".
# ONLY fans who paid for the Double Album qualify — owning one of the six
# standalone "- LLT (Single Series)" singles does NOT (they're their own
# thing; the "Bonus" is the Double Album's bonus-track edition for buyers).
# The double album is soft-deleted in prod but its ownership rows still
# entitle. One-time backfill of existing owners; the forward rule (new
# purchases) lives in server/lltBonus.ts. Marker-guarded so operator changes
# are never clobbered, idempotent via the user_albums (user_id, album_id)
# unique index, and a no-op on a fresh dev clone (Nick's catalog is
# prod-only). Only real owners (is_preview = false) are granted; the
# qualifying-release id MUST stay in lock-step with LLT_RELEASE_ALBUM_IDS /
# LLT_BONUS_ALBUM_ID in server/lltBonus.ts.
backfill_task_1460_llt_bonus() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1460 llt bonus grant on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
  v_bonus constant text := '4ee3d6b9-d01f-4573-b1d6-c60951c67211';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1460_llt_bonus_grant'
  ) THEN
    INSERT INTO user_albums (user_id, album_id)
    SELECT DISTINCT ua.user_id, v_bonus
    FROM user_albums ua
    WHERE ua.is_preview = false
      AND ua.album_id = '0da0fccf-292f-4259-82d1-f95a59eb45c0' -- Love Life Tragedy (Double Album)
    ON CONFLICT (user_id, album_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1460_llt_bonus_grant');
    RAISE NOTICE 'task-1460 llt bonus grant applied: % rows', v_count;
  ELSE
    RAISE NOTICE 'task-1460 llt bonus grant already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1460 llt bonus grant ok on $label"
    echo "$out" | grep -i 'llt bonus' || true
  else
    echo "post-merge: WARNING — task-1460 llt bonus grant failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1460_llt_bonus dev  "${DATABASE_URL:-}"
backfill_task_1460_llt_bonus prod "${PROD_DATABASE_URL:-}"

# Task #1493 — Reconnect orphaned buyers of deleted duplicate albums to the
# real, content-complete album. When near-duplicate albums were created (some
# from the old gogoods import) and the empty/duplicate copy was later soft-
# deleted, the fans who bought (or were granted) the dead copy were left
# pointing at a soft-deleted row — their purchase + GoodDeed certificate
# stranded on a dead album. This one-off data rectification carries those
# buyers onto the live album that actually holds the music/lyrics/video,
# preserving their certificate, so "you own what you bought" stays true.
#
# Confirmed prod situation (see task file): Love Life Tragedy (Double Album)
# (deleted) -> Love Life Tragedy (Bonus); plus four smaller deleted dupes
# (Della Chase "Heavy", J.P. Hopfelt's L.A. Vintage Rock, Screaming Trees
# "Strange Things Happening", Big Mouth Barry "Shut The Hell Up (Explicit).")
# each with a live same-artist content match. None of these deleted albums
# carry order_copies / signed_cert_certificates / referral_credits, so only
# user_albums (ownership + cert) and orders (provenance + GoodDeed number)
# need to move. The deliberate two-edition releases (Mendelson "After The
# Party", Sixpence "Rosemary Hill" + Signature Editions) and the standalone
# LLT Single Series are deliberately NOT in the pair list and stay untouched.
#
# Marker-guarded + idempotent (runs once per DB), a no-op on a fresh dev
# clone (Nick's catalog + gogoods data are prod-only). Order repoints skip
# any GoodDeed-number that already exists on the live album (a duplicate
# gogoods import) so per-album (album_id, good_deed_number) uniqueness holds.
backfill_task_1493_reconnect_orphans() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1493 reconnect orphans on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_double  constant text := '0da0fccf-292f-4259-82d1-f95a59eb45c0'; -- LLT (Double Album), soft-deleted
  v_bonus   constant text := '4ee3d6b9-d01f-4573-b1d6-c60951c67211'; -- LLT (Bonus), live
  -- Each pair maps a soft-deleted duplicate album to its live, content-
  -- complete equivalent for the same artist.
  v_pairs   constant text[] := ARRAY[
    '0da0fccf-292f-4259-82d1-f95a59eb45c0=>4ee3d6b9-d01f-4573-b1d6-c60951c67211', -- LLT Double -> LLT Bonus
    '1597e09d-f49e-4b87-8f6f-ea92a33086b7=>bcc1b906-465b-4047-9f3a-024496f595ed', -- Della Chase "Heavy" -> "Della Chase"
    '83d28879-f25b-4830-8dab-6e295c1c85e1=>676ae89a-6979-4c7d-86d7-45f124288f61', -- J.P. Hopfelt's L.A. Vintage Rock -> "L.A. Vintage Rock"
    '3ccd21aa-50bc-4b37-9590-34c5c2d8530e=>f4ce9c70-1d07-4fae-9cdf-8d6b2a61b612', -- Screaming Trees "Strange Things..." -> "Weird Things Happening"
    '411ff888-82c3-4600-b79f-d6895bfc7dca=>b8570d3d-23f7-48dc-8209-f6d8ff47144c'  -- Big Mouth Barry "Shut The Hell Up (Explicit)." -> live Explicit
  ];
  v_handled text[] := ARRAY[]::text[];
  v_pair    text;
  v_del     text;
  v_live    text;
  v_staff   integer := 0;
  v_cons    integer := 0;
  v_moved   integer := 0;
  v_ord     integer := 0;
  v_rep     RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1493_reconnect_orphaned_buyers') THEN
    RAISE NOTICE 'task-1493 reconnect orphaned buyers already applied — skipping';
    RETURN;
  END IF;

  -- Step 3 (run FIRST, while the dead Double rows still exist so the
  -- "never bought the Double" signature is meaningful): remove the unbacked
  -- free Bonus grants held by accounts that never purchased the Double Album.
  -- Signature = a cert-less Bonus row whose user has no entitlement on the
  -- Double Album (the four internal admin/staff comps — billdenk-style real
  -- buyers all carry a certificate). Confirmed by signature, not hard IDs.
  DELETE FROM user_albums b
  WHERE b.album_id = v_bonus
    AND b.certificate_number IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_albums d WHERE d.album_id = v_double AND d.user_id = b.user_id
    );
  GET DIAGNOSTICS v_staff = ROW_COUNT;
  RAISE NOTICE 'task-1493 removed % unbacked Bonus grant(s)', v_staff;

  -- Steps 1, 2 & 4: for each deleted->live pair, consolidate ownership and
  -- repoint orders onto the live album, carrying the GoodDeed certificate.
  FOREACH v_pair IN ARRAY v_pairs LOOP
    v_del  := split_part(v_pair, '=>', 1);
    v_live := split_part(v_pair, '=>', 2);

    -- (a) Buyer ALREADY owns the live album: carry the certificate onto the
    --     live row if it has none (COALESCE keeps an existing live cert),
    --     prefer the original purchase date, keep "owned" if either row is
    --     owned, then drop the now-redundant deleted-album row.
    UPDATE user_albums l
       SET certificate_number = COALESCE(l.certificate_number, d.certificate_number),
           acquired_at        = COALESCE(d.acquired_at, l.acquired_at),
           is_preview         = (l.is_preview AND d.is_preview)
      FROM user_albums d
     WHERE l.album_id = v_live AND d.album_id = v_del AND l.user_id = d.user_id;
    DELETE FROM user_albums d
     WHERE d.album_id = v_del
       AND EXISTS (SELECT 1 FROM user_albums l WHERE l.album_id = v_live AND l.user_id = d.user_id);
    GET DIAGNOSTICS v_cons = ROW_COUNT;

    -- (b) Buyer does NOT yet own the live album: move the entitlement row
    --     wholesale (it carries its own certificate + acquired_at + id).
    UPDATE user_albums SET album_id = v_live WHERE album_id = v_del;
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    -- (c) Repoint orders onto the live album so order history + certificate
    --     provenance read against it. Skip any order whose GoodDeed number
    --     already exists on the live album (a duplicate gogoods import) so
    --     per-album GoodDeed uniqueness is never violated.
    UPDATE orders o SET album_id = v_live
     WHERE o.album_id = v_del
       AND (o.good_deed_number IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM orders e WHERE e.album_id = v_live AND e.good_deed_number = o.good_deed_number
            ));
    GET DIAGNOSTICS v_ord = ROW_COUNT;

    RAISE NOTICE 'task-1493 pair % -> %: % consolidated, % moved, % order(s) repointed',
                 v_del, v_live, v_cons, v_moved, v_ord;
    v_handled := array_append(v_handled, v_del);
  END LOOP;

  -- Step 5: generic safety sweep — REPORT (never auto-fix) any OTHER soft-
  -- deleted album that still has order-backed owned entitlements, so the
  -- operator can confirm the correct live target by hand instead of the
  -- script guessing. (No album titled "RainTree(s)" exists in prod — flag
  -- for operator confirmation of the exact title if one is still expected.)
  FOR v_rep IN
    SELECT a.id, a.title, a.artist, COUNT(DISTINCT ua.user_id) AS buyers
      FROM albums a
      JOIN user_albums ua ON ua.album_id = a.id AND ua.is_preview = false
      JOIN orders o ON o.album_id = a.id AND o.status IN ('complete','paid','shipped')
     WHERE a.deleted_at IS NOT NULL
       AND NOT (a.id = ANY(v_handled))
     GROUP BY a.id, a.title, a.artist
     ORDER BY buyers DESC
  LOOP
    RAISE NOTICE 'task-1493 UNRESOLVED soft-deleted album with order-backed buyers: % — % / % (% buyer(s)) — needs operator confirmation',
                 v_rep.id, v_rep.artist, v_rep.title, v_rep.buyers;
  END LOOP;

  INSERT INTO post_merge_data_backfills (name) VALUES ('task_1493_reconnect_orphaned_buyers');
  RAISE NOTICE 'task-1493 reconnect orphaned buyers applied';
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1493 reconnect orphans ok on $label"
    echo "$out" | grep -i 'task-1493' || true
  else
    echo "post-merge: WARNING — task-1493 reconnect orphans failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1493_reconnect_orphans dev  "${DATABASE_URL:-}"
backfill_task_1493_reconnect_orphans prod "${PROD_DATABASE_URL:-}"

# PacPack (Pacific Packaging) — Bill & his wife's pre-Spinney in-house
# fulfillment operation. Create the partner (fixed id, mirrors the row
# hand-created in prod) and reassign every EasyPost-backfilled historical
# order to it so the dashboard credits PacPack, not Spinney, for the old
# fulfillment. Marker-guarded; the UPDATE is a no-op on a fresh dev clone
# (no easypost-backfilled orders there).
backfill_pacpack_reassignment() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping pacpack reassignment on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
INSERT INTO fulfillment_partners (id, name, location)
VALUES ('24a4ab12-7e02-4e4e-a94b-1c165d3dcef3', 'PacPack', 'Dana Point, CA, USA')
ON CONFLICT (id) DO NOTHING;
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'pacpack_easypost_reassignment'
  ) THEN
    UPDATE orders
       SET fulfillment_partner_id = '24a4ab12-7e02-4e4e-a94b-1c165d3dcef3'
     WHERE fulfillment_raw->>'source' = 'easypost_backfill_2026-06'
       AND fulfillment_partner_id IS DISTINCT FROM '24a4ab12-7e02-4e4e-a94b-1c165d3dcef3';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO post_merge_data_backfills (name) VALUES ('pacpack_easypost_reassignment');
    RAISE NOTICE 'pacpack reassignment applied: % orders', v_count;
  ELSE
    RAISE NOTICE 'pacpack reassignment already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: pacpack reassignment ok on $label"
    echo "$out" | grep -i 'pacpack' || true
  else
    echo "post-merge: WARNING — pacpack reassignment failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_pacpack_reassignment dev  "${DATABASE_URL:-}"
backfill_pacpack_reassignment prod "${PROD_DATABASE_URL:-}"

# Screaming Trees "Strange Things Happening (Ellensburg Demos 1986-1988)"
# de-duplication. Two rows describe the SAME 10-track demo set:
#   * 3ccd21aa… "Strange Things Happening (Ellensburg Demos 1986-1988)" — the
#     legacy gogoods import. Holds the only REAL sales (GoodDeed #1 + #2, two
#     paying owners) but is bare on content. Soft-deleted by hand on
#     2026-06-05.
#   * f4ce9c70… "Weird Things Happening" — a later hand-rebuild with all the
#     content work (lyrics, synced lyrics, writers, performers+gear, album
#     credits, liner notes) but ZERO real sales (only comp grants).
# Bill's call: keep the content-rich rebuild as the surviving row, move the
# real sales/ownership onto it, give it the correct title, and leave the bare
# original soft-deleted. Re-pointing 2 orders + 2 entitlements is far smaller
# and safer than re-mapping per-track content across song ids.
# Marker-guarded (true one-time), id-pinned, transactional, and a no-op on any
# DB that lacks these exact rows (a fresh dev clone) — Screaming Trees catalog
# is prod-only.
backfill_strange_things_consolidation() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping strange/weird consolidation on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_strange constant text := '3ccd21aa-50bc-4b37-9590-34c5c2d8530e'; -- bare, has sales, deleted
  v_weird   constant text := 'f4ce9c70-1d07-4fae-9cdf-8d6b2a61b612'; -- content-rich keeper
  v_legacy  text;
  v_orders  integer := 0;
  v_ents    integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'strange_things_weird_consolidation'
  ) THEN
    IF EXISTS (SELECT 1 FROM albums WHERE id = v_strange)
       AND EXISTS (SELECT 1 FROM albums WHERE id = v_weird) THEN

      -- 1) Move the real GoodDeed sales onto the keeper (numbers ride along).
      UPDATE orders SET album_id = v_weird WHERE album_id = v_strange;
      GET DIAGNOSTICS v_orders = ROW_COUNT;

      -- 2) Move the ownership entitlements (cert #1/#2) onto the keeper.
      UPDATE user_albums SET album_id = v_weird WHERE album_id = v_strange;
      GET DIAGNOSTICS v_ents = ROW_COUNT;

      -- 3) Transfer the legacy gogoods id so future re-imports dedupe against
      --    the keeper. The partial-unique index forbids holding it on both
      --    rows, so free the deleted row first, then stamp the keeper.
      SELECT legacy_gogoods_id INTO v_legacy FROM albums WHERE id = v_strange;
      IF v_legacy IS NOT NULL THEN
        UPDATE albums SET legacy_gogoods_id = NULL WHERE id = v_strange;
        UPDATE albums SET legacy_gogoods_id = v_legacy
         WHERE id = v_weird AND legacy_gogoods_id IS NULL;
      END IF;

      -- 4) Adopt the correct (canonical) title on the keeper.
      UPDATE albums
         SET title = 'Strange Things Happening (Ellensburg Demos 1986-1988)'
       WHERE id = v_weird AND title = 'Weird Things Happening';

      -- 5) Stamp first_sold_at from the moved sales so the post-sale metadata
      --    lock correctly engages on the keeper.
      UPDATE albums
         SET first_sold_at = (SELECT min(created_at) FROM orders WHERE album_id = v_weird)
       WHERE id = v_weird AND first_sold_at IS NULL;

      -- 6) The old Strange row stays soft-deleted and is now empty of sales.

      INSERT INTO post_merge_data_backfills (name) VALUES ('strange_things_weird_consolidation');
      RAISE NOTICE 'strange/weird consolidation applied: % orders, % entitlements moved', v_orders, v_ents;
    ELSE
      RAISE NOTICE 'strange/weird consolidation skipped — album rows not present on this DB';
    END IF;
  ELSE
    RAISE NOTICE 'strange/weird consolidation already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: strange/weird consolidation ok on $label"
    echo "$out" | grep -i 'consolidation' || true
  else
    echo "post-merge: WARNING — strange/weird consolidation failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_strange_things_consolidation dev  "${DATABASE_URL:-}"
backfill_strange_things_consolidation prod "${PROD_DATABASE_URL:-}"

# Task #1037 — Unified identity P2: link column users.customer_user_id +
# partial unique index. shared/schema.ts declares the column (no FK on
# purpose — a relational FK reappears on every publish dev→prod diff, see
# auth-tokens-fk-recurrence.md) and a partial unique index (drizzle-kit
# push has been unreliable on additive DDL). Hand-apply on BOTH dev and
# prod so the publish dev→prod diff stays empty and getUser (which now
# SELECTs the column) never 500s on a freshly-cloned dev. Idempotent.
migrate_users_customer_link() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping users.customer_user_id migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_user_id varchar;
CREATE UNIQUE INDEX IF NOT EXISTS users_customer_user_id_uniq
  ON users (customer_user_id) WHERE customer_user_id IS NOT NULL;
SQL
  then
    echo "post-merge: users.customer_user_id migration ok on $label"
  else
    echo "post-merge: WARNING — users.customer_user_id migration failed on $label (continuing)"
  fi
}
migrate_users_customer_link dev  "${DATABASE_URL:-}"
migrate_users_customer_link prod "${PROD_DATABASE_URL:-}"

# Task #1037 — TRUE ONE-TIME merge of duplicate humans: any (users,
# customer_users) pair that shares a real email is the same person, so
# link them (users.customer_user_id), fill the fan credential when it's
# empty (never overwrite), and mirror the fan's OAuth identities onto the
# admin row. After this the human signs into BOTH shells with one
# password + one Google/Apple identity. Marker-guarded so a later
# password change or relink is never clobbered on a subsequent merge.
# Runs on BOTH dev and prod — unlike the press-roster reconcile this is
# meant to mutate prod (that's the merge), and the marker makes it
# one-shot. Apple private-relay + @oauth.local placeholders are excluded
# (relay is keyed off provider sub, never email; placeholders aren't
# real shared addresses). Only unambiguous 1:1 matches are linked.
backfill_task_1037_link_humans() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1037 link backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_linked integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1037_link_humans'
  ) THEN
    -- 1) Link each admin row to its matching fan row (real email, 1:1,
    -- fan not already linked to a different admin, fan not merged away).
    WITH cand AS (
      SELECT u.id AS admin_id, c.id AS cust_id
      FROM users u
      JOIN customer_users c ON lower(c.email) = lower(u.email)
      WHERE u.customer_user_id IS NULL
        AND c.merged_into_id IS NULL
        AND u.email !~* '@privaterelay\.appleid\.com$'
        AND u.email !~* '@oauth\.local$'
        AND c.email !~* '@privaterelay\.appleid\.com$'
        AND c.email !~* '@oauth\.local$'
    ),
    safe AS (
      SELECT DISTINCT ON (cust_id) admin_id, cust_id
      FROM cand
      WHERE NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.customer_user_id = cand.cust_id)
      ORDER BY cust_id, admin_id
    )
    UPDATE users u SET customer_user_id = s.cust_id
    FROM safe s WHERE u.id = s.admin_id;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    -- 2) Fill an empty fan credential from the linked admin (never
    -- overwrite a real fan password; skip OAuth-only placeholders).
    UPDATE customer_users c
       SET password = u.password
      FROM users u
     WHERE u.customer_user_id = c.id
       AND c.password IS NULL
       AND u.password IS NOT NULL
       AND u.password NOT LIKE '!oauth-only:%';

    -- 3) Mirror the fan's OAuth identities onto the admin row so
    -- Google/Apple sign-in resolves on the admin shell too. The
    -- admin_identities unique (provider, provider_user_id) skips a sub
    -- already attached elsewhere — never re-points it.
    INSERT INTO admin_identities (user_id, provider, provider_user_id, email, linked_at)
    SELECT u.id, ci.provider, ci.provider_user_id, ci.email, NOW()
      FROM users u
      JOIN customer_identities ci ON ci.user_id = u.customer_user_id
     WHERE u.customer_user_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- 3b) Reverse mirror: copy the admin's OAuth identities onto the fan
    -- row (canonical store) so convergence runs both ways — a provider
    -- only ever attached on the admin shell still resolves on the player.
    -- customer_identities unique (provider, provider_user_id) skips a sub
    -- already attached elsewhere — never re-points it.
    INSERT INTO customer_identities (user_id, provider, provider_user_id, email, linked_at)
    SELECT u.customer_user_id, ai.provider, ai.provider_user_id, ai.email, NOW()
      FROM users u
      JOIN admin_identities ai ON ai.user_id = u.id
     WHERE u.customer_user_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1037_link_humans');
    RAISE NOTICE 'task-1037 link backfill applied: % humans linked', v_linked;
  ELSE
    RAISE NOTICE 'task-1037 link backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1037 link backfill ok on $label"
    echo "$out" | grep -i 'task-1037' || true
  else
    echo "post-merge: WARNING — task-1037 link backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1037_link_humans dev  "${DATABASE_URL:-}"
backfill_task_1037_link_humans prod "${PROD_DATABASE_URL:-}"

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

# Task #1425 — "Manager" partner type (label-style roster). Creates the
# `managers` entity table (mirrors labels minus press/Shopify/pricing) and
# the `people.manager_id` roster link (SET NULL). A manager's catalog is
# DERIVED from roster people's albums — there is NO albums.manager_id. The
# domain partial-unique excludes soft-deleted rows; drizzle-kit's db:push
# doesn't push WHERE-claused indexes, so we pre-create on both DBs to keep
# the publish dev→prod diff empty and stop /api/managers + the manager
# dashboard from 500'ing on a freshly-cloned dev. Idempotent (CREATE/ADD/
# CREATE INDEX all IF NOT EXISTS). Dated copy:
# scripts/prod-schema-fixups/2026-06-06-task-1425-managers.sql. NOTE: the
# manager ENTITY is distinct from the teammate sub-role "manager"
# (memberships.sub_role) — do not conflate.
migrate_managers() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping managers migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS managers (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  domain           text,
  logo_url         text,
  logo_locked      boolean NOT NULL DEFAULT false,
  bio              text,
  location         text,
  location_address jsonb,
  website_url      text,
  instagram_url    text,
  cover_url        text,
  created_at            timestamp DEFAULT now(),
  deleted_at            timestamp,
  deleted_by_user_id    varchar,
  deleted_via_parent_id varchar
);
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS manager_id varchar REFERENCES managers(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS managers_domain_unique;
CREATE UNIQUE INDEX IF NOT EXISTS managers_domain_unique
  ON managers (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;
SQL
  then
    echo "post-merge: managers migration ok on $label"
  else
    echo "post-merge: WARNING — managers migration failed on $label (continuing)"
  fi
}
migrate_managers dev  "${DATABASE_URL:-}"
migrate_managers prod "${PROD_DATABASE_URL:-}"

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

# Bonus videos now stream through Mux (signed adaptive HLS) just like audio
# masters. album_videos carries the same Mux columns, including the Task
# #1470 retry ladder (mux_retry_count / mux_last_retry_at) so a sourced row
# whose conversion genuinely errors backs off + ages out instead of being
# re-attempted on every reconcile interval forever. Pre-create on both DBs
# to keep the publish dev→prod diff empty and stop the video ingest/playback
# routes + reconcile sweep from 500'ing on a freshly-cloned dev. All
# additive — safe; the original upload stays in Object Storage as the
# ingest source.
migrate_album_videos_mux() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_videos mux migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_videos
  ADD COLUMN IF NOT EXISTS mux_asset_id      text,
  ADD COLUMN IF NOT EXISTS mux_playback_id   text,
  ADD COLUMN IF NOT EXISTS mux_status        text,
  ADD COLUMN IF NOT EXISTS mux_last_error    text,
  ADD COLUMN IF NOT EXISTS mux_retry_count   integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mux_last_retry_at timestamp;
SQL
  then
    echo "post-merge: album_videos mux migration ok on $label"
  else
    echo "post-merge: WARNING — album_videos mux migration failed on $label (continuing)"
  fi
}
migrate_album_videos_mux dev  "${DATABASE_URL:-}"
migrate_album_videos_mux prod "${PROD_DATABASE_URL:-}"

# Task #937 — branded order-receipt email. orders.receipt_email_sent_at
# is the atomic single-send claim (UPDATE … WHERE receipt_email_sent_at
# IS NULL). Pre-create on both DBs so the publish dev→prod diff stays
# empty and a freshly-cloned dev can fire the receipt without 500'ing
# materializeOrderFromSession. Additive nullable timestamp — safe.
migrate_orders_receipt_email_sent_at() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping orders.receipt_email_sent_at migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamp;
SQL
  then
    echo "post-merge: orders.receipt_email_sent_at migration ok on $label"
  else
    echo "post-merge: WARNING — orders.receipt_email_sent_at migration failed on $label (continuing)"
  fi
}
migrate_orders_receipt_email_sent_at dev  "${DATABASE_URL:-}"
migrate_orders_receipt_email_sent_at prod "${PROD_DATABASE_URL:-}"

# Task #1467 — fan-confirmed name for the DIGITAL GoodDeed certificate.
# orders.cert_confirmed_name / cert_confirmed_at let a digital-only owner
# override the synthesized recipient name on their cert PDF (the physical
# signed-cert add-on confirms on a signed_cert_certificates row instead).
# Pre-create on both DBs so the publish dev→prod diff stays empty and a
# freshly-cloned dev never 500s the digital-name read/confirm endpoint.
# Additive nullable columns — safe.
migrate_orders_cert_confirmed_name() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping orders.cert_confirmed_name migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cert_confirmed_name text,
  ADD COLUMN IF NOT EXISTS cert_confirmed_at   timestamp;
SQL
  then
    echo "post-merge: orders.cert_confirmed_name migration ok on $label"
  else
    echo "post-merge: WARNING — orders.cert_confirmed_name migration failed on $label (continuing)"
  fi
}
migrate_orders_cert_confirmed_name dev  "${DATABASE_URL:-}"
migrate_orders_cert_confirmed_name prod "${PROD_DATABASE_URL:-}"

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
# Task #668/#669 — `press_colors.import_source_url` records the
# upstream product/tile URL that a vendor color-library importer
# (MRP, Hellbender, …) pulled the swatch photo from, so re-runs can
# flag rows as "already imported." Pre-create on both DBs to keep the
# publish dev→prod diff empty and so the catalog route never 500s on
# a freshly-cloned dev DB.
migrate_press_colors_import_source_url() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_colors.import_source_url migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE press_colors ADD COLUMN IF NOT EXISTS import_source_url text;
SQL
  then
    echo "post-merge: press_colors.import_source_url migration ok on $label"
  else
    echo "post-merge: WARNING — press_colors.import_source_url migration failed on $label (continuing)"
  fi
}
migrate_press_colors_import_source_url dev  "${DATABASE_URL:-}"
migrate_press_colors_import_source_url prod "${PROD_DATABASE_URL:-}"

# Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only legacy)"
# marker on albums. Pre-create on both DBs to keep the publish dev→prod
# diff empty (so publish never tries to DROP it off prod with data) and so
# a freshly-cloned dev DB never 500s the album routes that select-all this
# column. Additive + idempotent; safe on every merge. Drop this block when
# the flag itself is retired.
migrate_albums_is_spin_promo() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping albums.is_spin_promo migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums ADD COLUMN IF NOT EXISTS is_spin_promo boolean NOT NULL DEFAULT false;
SQL
  then
    echo "post-merge: albums.is_spin_promo migration ok on $label"
  else
    echo "post-merge: WARNING — albums.is_spin_promo migration failed on $label (continuing)"
  fi
}
migrate_albums_is_spin_promo dev  "${DATABASE_URL:-}"
migrate_albums_is_spin_promo prod "${PROD_DATABASE_URL:-}"

# Task #1078 / #1112 — Apple-Music-style album footer fields. Task #1078
# added albums.copyright_line + albums.original_release_date to
# shared/schema.ts but never shipped a post-merge migrate_* block, so BOTH
# dev and prod drifted behind the schema (post-merge intentionally does NOT
# run db:push — see top of file). The published code SELECTs these columns
# on every Albums list load and UPDATEs them on every metadata/streaming
# save, so both 500 with "column does not exist" until the columns land.
# Pre-create on both DBs to keep the publish dev→prod diff empty and stop
# the 500s. Both nullable + additive — backwards-compatible, no rename. See
# .agents/memory/migration-claims-vs-reality.md.
migrate_albums_apple_footer_fields() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping albums apple-footer migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS copyright_line        text,
  ADD COLUMN IF NOT EXISTS original_release_date text,
  -- Task #1158 — per-album footer copyright symbol (℗ vs ©). Nullable;
  -- null renders as the ℗ default so existing rows are unchanged.
  ADD COLUMN IF NOT EXISTS copyright_symbol      text;
SQL
  then
    echo "post-merge: albums apple-footer migration ok on $label"
  else
    echo "post-merge: WARNING — albums apple-footer migration failed on $label (continuing)"
  fi
}
migrate_albums_apple_footer_fields dev  "${DATABASE_URL:-}"
migrate_albums_apple_footer_fields prod "${PROD_DATABASE_URL:-}"

# Task #965 / #1310 — clean per-release share slug (get.goodtunes.music/<slug>).
# Ensure the nullable share_slug column exists on both DBs so a freshly-cloned
# dev DB never 500s the album select-all routes and the publish dev->prod diff
# stays empty. Uniqueness is PER-ARTIST now and is managed SOLELY by
# migrate_task_1310_share_slugs below (composite albums_artist_share_slug_unique).
# Do NOT recreate the old global albums_share_slug_unique index here: it has no
# deleted_at filter, so a trashed release that kept its slug makes the index
# uncreatable, AND a transient create here races the publish dev->prod diff —
# a publish that introspects the dev DB mid-merge captures the global index and
# emits the failing "CREATE UNIQUE INDEX albums_share_slug_unique" against prod.
# Additive + idempotent; safe on every merge.
migrate_albums_share_slug() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping albums.share_slug migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums ADD COLUMN IF NOT EXISTS share_slug text;
SQL
  then
    echo "post-merge: albums.share_slug migration ok on $label"
  else
    echo "post-merge: WARNING — albums.share_slug migration failed on $label (continuing)"
  fi
}
migrate_albums_share_slug dev  "${DATABASE_URL:-}"
migrate_albums_share_slug prod "${PROD_DATABASE_URL:-}"

# Task #1233 — gear gallery. instruments.photo_urls (text[]) holds the
# additional listing photos beyond the hero `photo_url` (the Add-gear
# scraper now imports the whole gallery, not just the first shot). The
# enriched instrument read shape SELECTs * so a freshly-cloned dev DB
# missing this column would 500 every /api/instruments route; pre-create
# on both DBs to keep the publish dev->prod diff empty too. Additive
# nullable array — backwards-compatible, no rename. Safe on every merge.
migrate_instruments_photo_urls() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping instruments.photo_urls migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS photo_urls text[];
SQL
  then
    echo "post-merge: instruments.photo_urls migration ok on $label"
  else
    echo "post-merge: WARNING — instruments.photo_urls migration failed on $label (continuing)"
  fi
}
migrate_instruments_photo_urls dev  "${DATABASE_URL:-}"
migrate_instruments_photo_urls prod "${PROD_DATABASE_URL:-}"

# Task #1025 — album_skus exact catalog identity snapshot. The legacy
# vinyl_color/vinyl_color_tier snapshots store only display NAMES, which
# resolve to a different swatch for each admin once a press re-imports
# its catalog (ids regenerate) or the row is viewed under a different
# press. press_id/press_tier_id/press_color_id pin the saved pick to the
# exact catalog rows so it resolves identically for everyone. Additive
# nullable columns; pre-create on both DBs to keep the publish dev->prod
# diff empty and so a freshly-cloned dev never 500s the SKU routes that
# select-all this table. Idempotent; safe on every merge.
migrate_album_skus_press_identity() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_skus press-identity migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_skus
  ADD COLUMN IF NOT EXISTS press_id       varchar,
  ADD COLUMN IF NOT EXISTS press_tier_id  varchar,
  ADD COLUMN IF NOT EXISTS press_color_id varchar;
SQL
  then
    echo "post-merge: album_skus press-identity migration ok on $label"
  else
    echo "post-merge: WARNING — album_skus press-identity migration failed on $label (continuing)"
  fi
}
migrate_album_skus_press_identity dev  "${DATABASE_URL:-}"
migrate_album_skus_press_identity prod "${PROD_DATABASE_URL:-}"

# Task #683 — Reconcile dev press roster with prod so a publish dev->prod
# diff is a no-op over the manufacturers + press_* tables. The founding seed
# only mints Memphis + Hellbender (fresh ids per clone); the real Physical
# Music Products and Hoover Printing presses live only in prod, so a stale
# dev would DROP them (and PMP's confirmed pricing) from prod on publish and
# ADD the empty "Precision Pressing" leftover. This copies PMP + Hoover (and
# Spinney Media, the fulfillment partner both reference) into dev with prod's
# EXACT ids so publish sees matching rows instead of delete-and-recreate.
# ID-preserving + ON CONFLICT (id) DO NOTHING => idempotent and convergent
# with the lazy seedPmpCatalog() (its ensure* helpers match by natural key,
# so they reuse these rows rather than minting duplicates). DEV ONLY — prod
# is the source of truth here and must never be mutated from post-merge.
migrate_reconcile_press_roster() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press-roster reconcile on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
INSERT INTO fulfillment_partners (id,name,domain,logo_url,cover_url,bio,location,website_url,contact_email,contact_phone,shipping_address,created_at,location_address,shipping_address_struct) VALUES ('389bd449-b548-4fee-8e3a-4a5be9191a6a','Spinney Media',NULL,'/objects/uploads/451844ac-5ef5-46c6-b020-76d769b88a2c.jpg',NULL,NULL,NULL,'https://spinneymedia.com',NULL,NULL,NULL,'2026-05-23 08:02:28.889553'::timestamp,NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO manufacturers (id,name,domain,logo_url,cover_url,bio,location,website_url,contact_email,contact_phone,turnaround_days,specialties,default_fulfillment_partner_id,created_at,turnaround_weeks_min,turnaround_weeks_max,location_address,broker_discount_pct,operational_note) VALUES ('97f5c812-63f0-4f51-ada2-092f06663856','Physical Music Products','physicalmusicproducts.com','/objects/uploads/6bd431e0-86a8-4b7d-841a-35ae9f0d49ac.jpg','/objects/uploads/f0e4c9f4-6630-4283-ac4d-c88eceffc9cb.webp','Your records are our business.',NULL,'https://www.physicalmusicproducts.com',NULL,NULL,NULL,'{}'::text[],'389bd449-b548-4fee-8e3a-4a5be9191a6a','2026-05-24 02:32:56.32165'::timestamp,NULL,NULL,NULL,0,'Markup model not yet confirmed — treating retail = cost on confirmed rungs until PMP states otherwise.') ON CONFLICT (id) DO NOTHING;
INSERT INTO manufacturers (id,name,domain,logo_url,cover_url,bio,location,website_url,contact_email,contact_phone,turnaround_days,specialties,default_fulfillment_partner_id,created_at,turnaround_weeks_min,turnaround_weeks_max,location_address,broker_discount_pct,operational_note) VALUES ('01e0761e-c637-4089-aa2a-9102aeeba3b2','Hoover Printing','hooverprinting.com','/objects/uploads/0f3295ce-f6b7-47fe-90ac-5f3b3cdea8e8.png','/objects/uploads/9dafd61a-2d70-44ec-bc02-bd35c3c97397.jpg','Hoover Printing has provided Commercial Printing, Digital, Offset, Letterpress, Business Cards, Books and more services in Orange County, CA.',NULL,'https://hooverprinting.com/',NULL,NULL,NULL,'{}'::text[],'389bd449-b548-4fee-8e3a-4a5be9191a6a','2026-05-24 04:18:13.790391'::timestamp,NULL,NULL,NULL,0,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_formats (id,press_id,format,position) VALUES ('85cef1f1-7bac-4c94-b291-90bc7d3b3c77','97f5c812-63f0-4f51-ada2-092f06663856','12_lp',0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_formats (id,press_id,format,position) VALUES ('ef27b4af-b90a-4a53-ae63-bd96a8904817','97f5c812-63f0-4f51-ada2-092f06663856','12_double',1) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_jackets (id,press_id,name,position,is_default) VALUES ('7ba0fc65-f750-4d7d-8d7d-18115534f460','97f5c812-63f0-4f51-ada2-092f06663856','Standard Full-Color Jacket',0,true) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('adebfd66-b82f-4715-b5f5-467d7b446ac4','97f5c812-63f0-4f51-ada2-092f06663856','12_double','Black',0,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('59a8df17-1e1f-4113-b272-16d656b79999','97f5c812-63f0-4f51-ada2-092f06663856','12_double','Color',1,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('2ebb488e-0598-4029-9596-d6510af1b4db','97f5c812-63f0-4f51-ada2-092f06663856','12_double','Splatter',2,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('55d13fcc-06d2-4033-b505-a512bee9bca8','97f5c812-63f0-4f51-ada2-092f06663856','12_double','Translucent',3,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('a15639f5-d4f1-4434-b558-a567bcda5677','97f5c812-63f0-4f51-ada2-092f06663856','12_double','Opaque',4,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('212fff10-fc7e-4dff-8be9-a6c98d7993ce','97f5c812-63f0-4f51-ada2-092f06663856','12_lp','Black',0,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('7138145a-c0a5-4e01-ac96-a80fb1df9d6f','97f5c812-63f0-4f51-ada2-092f06663856','12_lp','Color',1,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('d6dc1c42-4cb0-44d0-8ed7-454032160f0a','97f5c812-63f0-4f51-ada2-092f06663856','12_lp','Splatter',2,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('65c1ea44-4eba-4c94-9027-eda7adce12e9','97f5c812-63f0-4f51-ada2-092f06663856','12_lp','Translucent',3,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_color_tiers (id,press_id,format,name,position,price_ladder,masters_prep_cost_cents) VALUES ('d09d1c13-b96b-4061-8a9f-1ba89f1196d0','97f5c812-63f0-4f51-ada2-092f06663856','12_lp','Opaque',4,'[]'::jsonb,0) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('600187cc-a490-4fd4-ac47-9a63bd0963f7','55d13fcc-06d2-4033-b505-a512bee9bca8','Clear','#e8eef2',NULL,0,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('9ac0d7cd-d1dd-4c24-9a9d-2ce8740082ad','55d13fcc-06d2-4033-b505-a512bee9bca8','Ruby Red','#c0566a',NULL,1,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('be12f82f-146b-47da-bed1-9ebd7fa249af','55d13fcc-06d2-4033-b505-a512bee9bca8','Orange','#f0a866',NULL,2,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('89cf1156-f81e-4546-80c3-29184c75cccf','55d13fcc-06d2-4033-b505-a512bee9bca8','Gold','#e6c66a',NULL,3,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('d588663f-ccfc-4208-9e11-b4e1a33bd9a2','55d13fcc-06d2-4033-b505-a512bee9bca8','Yellow','#f2e79a',NULL,4,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('189bbe08-28b4-4db0-9979-8e43ca5cde67','55d13fcc-06d2-4033-b505-a512bee9bca8','Green','#5fb98a',NULL,5,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('b44f403c-ebd2-41b3-8b05-5dc6a6156af5','55d13fcc-06d2-4033-b505-a512bee9bca8','Blue','#5a86c8',NULL,6,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('01880497-ccb7-40f3-972c-801b909bf138','55d13fcc-06d2-4033-b505-a512bee9bca8','Violet','#9a6fc0',NULL,7,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('626c1760-60fd-4054-a55b-9dec518d3bd7','55d13fcc-06d2-4033-b505-a512bee9bca8','Smoke','#8a8f96',NULL,8,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('dc826944-88d2-4c54-ab82-b2bc282386c6','65c1ea44-4eba-4c94-9027-eda7adce12e9','Clear','#e8eef2',NULL,0,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('b7898ae8-9a6e-497d-ba70-fbbcd7381207','65c1ea44-4eba-4c94-9027-eda7adce12e9','Ruby Red','#c0566a',NULL,1,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('772a2193-e586-46c1-acc9-9f028329153f','65c1ea44-4eba-4c94-9027-eda7adce12e9','Orange','#f0a866',NULL,2,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('6cb9e87f-4069-4364-9110-e43c404a3b4c','65c1ea44-4eba-4c94-9027-eda7adce12e9','Gold','#e6c66a',NULL,3,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('5716ab42-28ba-40c4-8e61-9d326b161e2a','65c1ea44-4eba-4c94-9027-eda7adce12e9','Yellow','#f2e79a',NULL,4,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('07b508ed-2ed8-4934-83ab-306cef4bb131','65c1ea44-4eba-4c94-9027-eda7adce12e9','Green','#5fb98a',NULL,5,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('68b4e6ab-5e3c-47ad-846c-d7166ae761e6','65c1ea44-4eba-4c94-9027-eda7adce12e9','Blue','#5a86c8',NULL,6,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('5bfe87a5-b9fd-4feb-abd9-2081271548ed','65c1ea44-4eba-4c94-9027-eda7adce12e9','Violet','#9a6fc0',NULL,7,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('a9713b81-ac4b-403a-ab55-cbcdc784ced6','65c1ea44-4eba-4c94-9027-eda7adce12e9','Smoke','#8a8f96',NULL,8,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('c3bb5e4f-a7d0-4000-ac81-004090111638','a15639f5-d4f1-4434-b558-a567bcda5677','White','#f5f5f2',NULL,0,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('6ef61dc5-746a-4490-9328-90c18946150a','a15639f5-d4f1-4434-b558-a567bcda5677','Cream','#efe7d2',NULL,1,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('705f97e7-bdd9-461e-b79a-9a49fbe0946f','a15639f5-d4f1-4434-b558-a567bcda5677','Red','#c8242b',NULL,2,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('8be118e4-5c2a-4bbd-9aed-439056e45cf7','a15639f5-d4f1-4434-b558-a567bcda5677','Orange','#ef8b3a',NULL,3,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('df1fed7d-b1a9-4970-a493-7ae9a8003308','a15639f5-d4f1-4434-b558-a567bcda5677','Yellow','#f5e23a',NULL,4,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('1be07c1a-1adf-4a52-ad72-c68a01955835','a15639f5-d4f1-4434-b558-a567bcda5677','Green','#3f8f57',NULL,5,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('11a9c222-3943-434d-8460-b8cd65512903','a15639f5-d4f1-4434-b558-a567bcda5677','Blue','#2f63c0',NULL,6,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('a41e8ed1-4225-4329-b33e-4eaf9d6a5430','a15639f5-d4f1-4434-b558-a567bcda5677','Purple','#7a3aa8',NULL,7,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('7fb513e5-652e-4ece-baee-3ce44d3457cd','a15639f5-d4f1-4434-b558-a567bcda5677','Pink','#f0468f',NULL,8,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('1a9c8368-affc-470b-afc8-6acb595fa6dc','a15639f5-d4f1-4434-b558-a567bcda5677','Brown','#5b3a1e',NULL,9,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('334165e7-4e3d-4b4e-8beb-93eee33479cf','a15639f5-d4f1-4434-b558-a567bcda5677','Grey','#8a8a8a',NULL,10,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('b2dfcf22-1d21-433c-9c79-87662ddfcea3','a15639f5-d4f1-4434-b558-a567bcda5677','Silver','#c2c6cc',NULL,11,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('d241d9d0-ec4e-40e6-b21a-e3f0a22b1da3','a15639f5-d4f1-4434-b558-a567bcda5677','Gold','#c9a44a',NULL,12,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('15a4283e-2555-4ba1-a629-7027676adab4','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','White','#f5f5f2',NULL,0,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('8eea48ec-c340-4d4d-80d9-ba1e295f4f4b','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Cream','#efe7d2',NULL,1,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('51807c5b-03f3-4d08-90bb-45c24efaf089','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Red','#c8242b',NULL,2,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('873e272e-2c51-476a-8ef4-bde81584a33f','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Orange','#ef8b3a',NULL,3,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('8b9eb12c-941d-44f9-9685-f33de0714dc6','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Yellow','#f5e23a',NULL,4,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('04e2e830-7cf4-4c9d-b2a3-6e5c117c3889','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Green','#3f8f57',NULL,5,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('6d31aadb-695b-45e9-9045-9b805bae913d','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Blue','#2f63c0',NULL,6,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('b0ef3c56-7af8-4be0-9b21-d8414b051cad','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Purple','#7a3aa8',NULL,7,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('b4af1c6c-2817-4295-a0b4-5761945379a9','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Pink','#f0468f',NULL,8,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('f7150a51-d667-4e9a-976d-9424d5034462','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Brown','#5b3a1e',NULL,9,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('c2e647be-fb30-4eaa-b027-a71a78da4834','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Grey','#8a8a8a',NULL,10,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('ff7ab21d-68a3-4bc7-a3a6-065bbd67a1b8','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Silver','#c2c6cc',NULL,11,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_colors (id,tier_id,name,swatch_hex,swatch_image_url,position,import_source_url) VALUES ('16a80091-542e-4236-a47a-75b3d19184d8','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','Gold','#c9a44a',NULL,12,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('7c719776-ded2-4d60-8bfd-fbe35927926f','212fff10-fc7e-4dff-8be9-a6c98d7993ce','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('b5e472c0-8e00-4d21-ad4c-0e57b6bb7665','2ebb488e-0598-4029-9596-d6510af1b4db','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": true, "unitCents": 3265}, {"qty": 1000, "confirmed": true, "unitCents": 2514}, {"qty": 2000, "confirmed": true, "unitCents": 2274}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('824f223c-ef71-475e-b9b0-80545ce8ae53','55d13fcc-06d2-4033-b505-a512bee9bca8','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('e28378c1-d4de-4b9e-9231-4d97ee8744be','59a8df17-1e1f-4113-b272-16d656b79999','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": true, "unitCents": 2315}, {"qty": 1000, "confirmed": true, "unitCents": 1654}, {"qty": 2000, "confirmed": true, "unitCents": 1374}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('c3fc2625-d0ea-4202-a3b0-43892d0a64e3','65c1ea44-4eba-4c94-9027-eda7adce12e9','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('735464c7-c8e4-4097-95ee-b1fb34f5e3d5','7138145a-c0a5-4e01-ac96-a80fb1df9d6f','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('622d1fe9-6936-4f11-8757-c9dd1a18454f','a15639f5-d4f1-4434-b558-a567bcda5677','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('75dd7f47-37c0-485c-bee5-680fd0ff0d49','adebfd66-b82f-4715-b5f5-467d7b446ac4','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('4cb042f6-a9d7-44e1-90fe-cd4ca22b06c5','d09d1c13-b96b-4061-8a9f-1ba89f1196d0','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO press_tier_jacket_ladders (id,tier_id,jacket_id,price_ladder) VALUES ('eea2a8b8-efb8-4b37-8fb7-5283a71c838d','d6dc1c42-4cb0-44d0-8ed7-454032160f0a','7ba0fc65-f750-4d7d-8d7d-18115534f460','[{"qty": 100, "confirmed": false, "unitCents": 0}, {"qty": 200, "confirmed": false, "unitCents": 0}, {"qty": 300, "confirmed": false, "unitCents": 0}, {"qty": 500, "confirmed": false, "unitCents": 0}, {"qty": 1000, "confirmed": false, "unitCents": 0}, {"qty": 2000, "confirmed": false, "unitCents": 0}]'::jsonb) ON CONFLICT (id) DO NOTHING;
-- Retire the stray, empty "Precision Pressing": dropped from the founding-
-- press seed but lingering in the canonical dev DB. Hard-delete when
-- unreferenced; soft-delete (deleted_at) if anything points at it.
DO $$
DECLARE pid varchar; refs int;
BEGIN
  SELECT id INTO pid FROM manufacturers
   WHERE domain='precisionpressing.com' AND deleted_at IS NULL LIMIT 1;
  IF pid IS NULL THEN RETURN; END IF;
  SELECT
     (SELECT count(*) FROM admin_invites        WHERE default_press_id=pid)
    +(SELECT count(*) FROM labels                WHERE default_press_id=pid OR invited_by_press_id=pid)
    +(SELECT count(*) FROM people                WHERE default_press_id=pid OR invited_by_press_id=pid)
    +(SELECT count(*) FROM press_invited_albums  WHERE press_id=pid)
    +(SELECT count(*) FROM press_pricing_syncs   WHERE press_id=pid)
    +(SELECT count(*) FROM press_switch_history  WHERE from_press_id=pid OR to_press_id=pid)
    +(SELECT count(*) FROM rfq_replies           WHERE manufacturer_id=pid)
    +(SELECT count(*) FROM press_formats         WHERE press_id=pid)
    +(SELECT count(*) FROM press_color_tiers     WHERE press_id=pid)
    +(SELECT count(*) FROM press_format_costs    WHERE press_id=pid)
    +(SELECT count(*) FROM press_jackets         WHERE press_id=pid)
   INTO refs;
  IF refs > 0 THEN
    UPDATE manufacturers SET deleted_at = now() WHERE id = pid;
  ELSE
    DELETE FROM manufacturers WHERE id = pid;
  END IF;
END
$$;
COMMIT;
SQL
  then
    echo "post-merge: press-roster reconcile ok on $label"
  else
    echo "post-merge: WARNING — press-roster reconcile failed on $label (continuing)"
  fi
}
# DEV ONLY: prod already has these rows; never mutate prod from here.
migrate_reconcile_press_roster dev "${DATABASE_URL:-}"

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

# Task #909 — admin per-fan album PREVIEW (Demo). shared/schema.ts adds two
# columns to user_albums (is_preview + preview_expires_at) that gate the
# 24h time-boxed full-playback preview. drizzle-kit push bails on this
# repo's unrelated dev-table drift, so sweep both DBs idempotently here to
# keep the publish dev→prod diff empty and a fresh-clone dev from failing
# the my-albums / playback-gate reads. Additive + nullable; safe to re-run.
migrate_task_909_album_preview() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-909 album-preview migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE user_albums
  ADD COLUMN IF NOT EXISTS is_preview         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_expires_at timestamp;
SQL
  then
    echo "post-merge: task-909 album-preview migration ok on $label"
  else
    echo "post-merge: WARNING — task-909 album-preview migration failed on $label (continuing)"
  fi
}
migrate_task_909_album_preview dev  "${DATABASE_URL:-}"
migrate_task_909_album_preview prod "${PROD_DATABASE_URL:-}"

# Task #816 — additional streaming-service handoff URLs (Tidal / Qobuz /
# Deezer / Pandora) on albums, people, and person_discography. Additive,
# nullable text columns; drizzle-kit push bails on this repo's unrelated
# dev-table drift, so sweep both DBs idempotently here to keep the
# publish dev→prod diff empty and a fresh-clone dev from 500ing the
# album/person serializers.
migrate_task_816_streaming_links() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-816 streaming-links migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS tidal_url   text,
  ADD COLUMN IF NOT EXISTS qobuz_url   text,
  ADD COLUMN IF NOT EXISTS deezer_url  text,
  ADD COLUMN IF NOT EXISTS pandora_url text;
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS tidal_url   text,
  ADD COLUMN IF NOT EXISTS qobuz_url   text,
  ADD COLUMN IF NOT EXISTS deezer_url  text,
  ADD COLUMN IF NOT EXISTS pandora_url text;
ALTER TABLE person_discography
  ADD COLUMN IF NOT EXISTS tidal_url   text,
  ADD COLUMN IF NOT EXISTS qobuz_url   text,
  ADD COLUMN IF NOT EXISTS deezer_url  text,
  ADD COLUMN IF NOT EXISTS pandora_url text;
SQL
  then
    echo "post-merge: task-816 streaming-links migration ok on $label"
  else
    echo "post-merge: WARNING — task-816 streaming-links migration failed on $label (continuing)"
  fi
}
migrate_task_816_streaming_links dev  "${DATABASE_URL:-}"
migrate_task_816_streaming_links prod "${PROD_DATABASE_URL:-}"

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

# Task #665 — people.contact_phone + people.is_artist_promoted. The Add
# Admin partner-contact flow writes phone alongside contact_email, and
# operators flip is_artist_promoted from the contact-shape Person page
# to turn a business contact into a full artist record. Additive
# columns; idempotent on both DBs.
migrate_people_contact_phone() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping people.contact_phone migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS contact_phone        text,
  ADD COLUMN IF NOT EXISTS is_artist_promoted   boolean NOT NULL DEFAULT false;
SQL
  then
    echo "post-merge: people.contact_phone migration ok on $label"
  else
    echo "post-merge: WARNING — people.contact_phone migration failed on $label (continuing)"
  fi
}
migrate_people_contact_phone dev  "${DATABASE_URL:-}"
migrate_people_contact_phone prod "${PROD_DATABASE_URL:-}"

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

# Task #998 — base custom_addons + custom_addon_artists tables. shared/schema.ts
# declares these (Task #844) but drizzle-kit push bailed interactively, so the
# CREATE TABLE never landed on either DB and every custom-add-on read/write
# 500s ("relation custom_addons does not exist"). Hand-apply idempotent CREATE
# TABLE IF NOT EXISTS matching the schema. MUST run BEFORE the all-artists
# ALTER below so that ALTER finally has a table to operate on.
migrate_custom_addons_tables() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping custom_addons tables migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS custom_addons (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  description              text,
  image_url                text,
  price_cents              integer NOT NULL,
  shipping_cents           integer NOT NULL DEFAULT 0,
  fulfiller                text,
  active                   boolean NOT NULL DEFAULT true,
  applies_to_all_artists   boolean NOT NULL DEFAULT false,
  position                 integer NOT NULL DEFAULT 0,
  created_at               timestamp DEFAULT now()
);
-- Task #1867 — per-box shipping the fan pays. Additive on pre-existing
-- tables (the CREATE above only seeds the column on fresh clones).
ALTER TABLE IF EXISTS custom_addons
  ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS custom_addon_artists (
  custom_addon_id varchar NOT NULL REFERENCES custom_addons(id) ON DELETE CASCADE,
  person_id       varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at      timestamp DEFAULT now(),
  PRIMARY KEY (custom_addon_id, person_id)
);
SQL
  then
    echo "post-merge: custom_addons tables migration ok on $label"
  else
    echo "post-merge: WARNING — custom_addons tables migration failed on $label (continuing)"
  fi
}
migrate_custom_addons_tables dev  "${DATABASE_URL:-}"
migrate_custom_addons_tables prod "${PROD_DATABASE_URL:-}"

# Task #1867 — ONE-TIME backfill: stamp the Gift of Hope add-on with Bill's
# $7/box fan-paid shipping so the launch night ships with it set. Marker-
# guarded in post_merge_data_backfills so a later operator edit (raising or
# lowering the per-box rate in the admin) is never clobbered on a subsequent
# merge. Only touches rows still at the 0 default whose name matches Gift of
# Hope, so other charities' add-ons are untouched.
backfill_task_1867_gift_of_hope_shipping() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1867 gift-of-hope shipping backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1867_gift_of_hope_shipping'
  ) THEN
    UPDATE custom_addons
       SET shipping_cents = 700
     WHERE shipping_cents = 0
       AND name ILIKE '%gift of hope%';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1867_gift_of_hope_shipping');

    RAISE NOTICE 'task-1867 backfill applied: % gift-of-hope add-on(s) set to $7/box', v_count;
  ELSE
    RAISE NOTICE 'task-1867 backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1867 gift-of-hope shipping backfill ok on $label"
    echo "$out" | grep -i 'task-1867' || true
  else
    echo "post-merge: WARNING — task-1867 gift-of-hope shipping backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1867_gift_of_hope_shipping dev  "${DATABASE_URL:-}"
backfill_task_1867_gift_of_hope_shipping prod "${PROD_DATABASE_URL:-}"

# Task #987 — custom add-on "all artists" scope. When true the add-on
# applies to every eligible album regardless of the per-artist attach
# join; default false preserves the original attach-to-specific-artists
# behavior. Additive + idempotent, safe on every merge / pre-migrated DB.
migrate_custom_addons_all_artists() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping custom_addons all-artists migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE custom_addons
  ADD COLUMN IF NOT EXISTS applies_to_all_artists boolean NOT NULL DEFAULT false;
SQL
  then
    echo "post-merge: custom_addons all-artists migration ok on $label"
  else
    echo "post-merge: WARNING — custom_addons all-artists migration failed on $label (continuing)"
  fi
}
migrate_custom_addons_all_artists dev  "${DATABASE_URL:-}"
migrate_custom_addons_all_artists prod "${PROD_DATABASE_URL:-}"

# Task #1842 — custom add-on variable / fan-chosen amount.
# Adds three nullable columns to custom_addons:
#   fan_chooses_amount boolean NOT NULL DEFAULT false
#   min_amount_cents   integer (floor enforced server-side)
#   preset_amounts_cents jsonb (array of integer cents for preset chips)
# All additive + idempotent. Safe to re-run on both DBs.
migrate_custom_addons_variable_amount() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping custom_addons variable-amount migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE custom_addons
  ADD COLUMN IF NOT EXISTS fan_chooses_amount   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_amount_cents      integer,
  ADD COLUMN IF NOT EXISTS preset_amounts_cents  jsonb;
SQL
  then
    echo "post-merge: custom_addons variable-amount migration ok on $label"
  else
    echo "post-merge: WARNING — custom_addons variable-amount migration failed on $label (continuing)"
  fi
}
migrate_custom_addons_variable_amount dev  "${DATABASE_URL:-}"
migrate_custom_addons_variable_amount prod "${PROD_DATABASE_URL:-}"

# Task #1842 — backfill Nightbirde Foundation's "Gift of Hope" add-on with
# fan_chooses_amount=true, min_amount_cents=5000 ($50), and four preset chips
# ($50/$75/$100/$250). Identified by name to survive env-to-env ID drift.
# Marker-guarded so it only runs once per DB.
backfill_nightbirde_gift_of_hope_variable() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping Gift of Hope variable-amount backfill on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE marker = 'nightbirde_gift_of_hope_variable_amount_v1'
  ) THEN
    UPDATE custom_addons
    SET
      fan_chooses_amount    = true,
      min_amount_cents      = 5000,
      preset_amounts_cents  = '[5000, 7500, 10000, 25000]'::jsonb
    WHERE name = 'Gift of Hope'
      AND fan_chooses_amount IS NOT TRUE;
    INSERT INTO post_merge_data_backfills (marker) VALUES ('nightbirde_gift_of_hope_variable_amount_v1')
      ON CONFLICT (marker) DO NOTHING;
  END IF;
END;
$$;
SQL
  then
    echo "post-merge: Gift of Hope variable-amount backfill ok on $label"
  else
    echo "post-merge: WARNING — Gift of Hope variable-amount backfill failed on $label (continuing)"
  fi
}
backfill_nightbirde_gift_of_hope_variable dev  "${DATABASE_URL:-}"
backfill_nightbirde_gift_of_hope_variable prod "${PROD_DATABASE_URL:-}"

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

# Hellbender record swatches — replace the old gray/white studio-mockup color
# swatches with the realistic tinted-vinyl-disc swatches generated from the
# supplied PSD (one disc per catalog color; see
# scripts/backfill-hellbender-records.ts). The disc PNGs are already mirrored
# into the shared Object Storage bucket and their /objects/uploads/<id> URLs
# are committed in scripts/data/hellbender-records.json, so this never
# re-uploads — it just re-points every Hellbender press_colors row at its disc
# image. Main dev+prod were updated directly when the task shipped; this gate
# lets a freshly-seeded clone converge without a manual pass.
#
# Marker-guarded (post_merge_data_backfills / hellbender_record_swatches_v1)
# so it runs exactly once per DB and never clobbers a later operator swatch
# edit (the script itself re-points unconditionally, so the guard lives here).
backfill_hellbender_record_swatches() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping hellbender-record-swatches backfill on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 -tAc \
       "SELECT 1 FROM post_merge_data_backfills WHERE name = 'hellbender_record_swatches_v1'" \
       2>/dev/null | grep -q 1; then
    echo "post-merge: hellbender-record-swatches backfill already applied on $label — skipping"
    return 0
  fi
  if DATABASE_URL="$url" npx tsx scripts/backfill-hellbender-records.ts; then
    psql "$url" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
INSERT INTO post_merge_data_backfills (name) VALUES ('hellbender_record_swatches_v1')
  ON CONFLICT (name) DO NOTHING;
SQL
    echo "post-merge: hellbender-record-swatches backfill ok on $label"
  else
    echo "post-merge: WARNING — hellbender-record-swatches backfill failed on $label (continuing)"
  fi
}
backfill_hellbender_record_swatches dev  "${DATABASE_URL:-}"
backfill_hellbender_record_swatches prod "${PROD_DATABASE_URL:-}"

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
-- Task #1916 — deterministic default-partner routing.
ALTER TABLE fulfillment_partners  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
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

# Task #1918 — per-album fulfillment routing override. Nullable FK on albums
# pointing at fulfillment_partners; SET NULL on partner delete so trashing a
# warehouse never strands a release (it falls back to the platform default).
migrate_album_fulfillment_partner() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping album_fulfillment_partner migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE albums ADD COLUMN IF NOT EXISTS fulfillment_partner_id varchar;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'albums_fulfillment_partner_id_fulfillment_partners_id_fk'
  ) THEN
    ALTER TABLE albums
      ADD CONSTRAINT albums_fulfillment_partner_id_fulfillment_partners_id_fk
      FOREIGN KEY (fulfillment_partner_id)
      REFERENCES fulfillment_partners(id) ON DELETE SET NULL;
  END IF;
END $$;
SQL
  then
    echo "post-merge: album_fulfillment_partner migration ok on $label"
  else
    echo "post-merge: WARNING — album_fulfillment_partner migration failed on $label (continuing)"
  fi
}
migrate_album_fulfillment_partner dev  "${DATABASE_URL:-}"
migrate_album_fulfillment_partner prod "${PROD_DATABASE_URL:-}"

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

# Task #550 — Gifting at checkout + post-purchase window. Adds per-copy
# gifting (gifts.copy_id), optional gift-card message, scheduled
# delivery (deliver_on), recipient pre-lookup (recipient_user_id),
# delivered_at + reverted_at audit columns, and a configurable
# payout_settings.gifting_window_days. Uniqueness on gifts is enforced
# via two partial indexes (legacy whole-order vs. per-copy) — same
# pattern as signed_cert_certificates from Task #549. Idempotent on
# both DBs so a fresh-clone dev never 500s the gift endpoints and the
# publish dev→prod diff stays empty.
migrate_task_550_gifting() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-550 gifting migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS copy_id            varchar,
  ADD COLUMN IF NOT EXISTS recipient_user_id  varchar,
  ADD COLUMN IF NOT EXISTS message            text,
  ADD COLUMN IF NOT EXISTS deliver_on         text,
  ADD COLUMN IF NOT EXISTS delivered_at       timestamp,
  ADD COLUMN IF NOT EXISTS reverted_at        timestamp;
-- Drop the legacy single-gift-per-order unique constraint (auto-named
-- by drizzle from the original .unique() on order_id) so multi-copy
-- orders can carry one gift per copy. Tries both common names.
ALTER TABLE gifts DROP CONSTRAINT IF EXISTS gifts_order_id_unique;
ALTER TABLE gifts DROP CONSTRAINT IF EXISTS gifts_order_id_key;
DROP INDEX IF EXISTS gifts_order_id_unique;
DROP INDEX IF EXISTS gifts_order_id_key;
-- Replace with two partial unique indexes: one whole-order gift per
-- order (copy_id IS NULL), one per (order_id, copy_id) when set.
CREATE UNIQUE INDEX IF NOT EXISTS gifts_order_whole_uniq
  ON gifts (order_id) WHERE copy_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gifts_order_copy_uniq
  ON gifts (order_id, copy_id) WHERE copy_id IS NOT NULL;
-- Add FKs only when the referenced table exists and the constraint
-- isn't already there. Skips silently on a freshly-cloned dev where
-- order_copies may have been added after gifts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gifts_copy_id_order_copies_id_fk') THEN
    BEGIN
      ALTER TABLE gifts
        ADD CONSTRAINT gifts_copy_id_order_copies_id_fk
        FOREIGN KEY (copy_id) REFERENCES order_copies(id) ON DELETE CASCADE;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gifts_recipient_user_id_customer_users_id_fk') THEN
    BEGIN
      ALTER TABLE gifts
        ADD CONSTRAINT gifts_recipient_user_id_customer_users_id_fk
        FOREIGN KEY (recipient_user_id) REFERENCES customer_users(id) ON DELETE SET NULL;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;
END
$$;
ALTER TABLE payout_settings
  ADD COLUMN IF NOT EXISTS gifting_window_days integer NOT NULL DEFAULT 30;
COMMIT;
SQL
  then
    echo "post-merge: task-550 gifting migration ok on $label"
  else
    echo "post-merge: WARNING — task-550 gifting migration failed on $label (continuing)"
  fi
}
migrate_task_550_gifting dev  "${DATABASE_URL:-}"
migrate_task_550_gifting prod "${PROD_DATABASE_URL:-}"

# ── Task #616 — Per-song Splits soft-delete columns ──────────────────
# The track_publishing_splits and track_mechanical_splits tables grew
# deleted_at columns when splits gained soft-delete semantics (payout
# snapshots reference rows by id, so deletes must remain resolvable).
# drizzle-kit push has been stalling on unrelated interactive prompts,
# so apply the two ALTERs directly here on both DBs — idempotent.
migrate_task_616_splits_soft_delete() {
  local label="$1"; local url="$2"
  [ -z "$url" ] && return 0
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
ALTER TABLE track_publishing_splits ADD COLUMN IF NOT EXISTS deleted_at timestamp;
ALTER TABLE track_mechanical_splits ADD COLUMN IF NOT EXISTS deleted_at timestamp;
COMMIT;
SQL
  then
    echo "post-merge: task-616 splits soft-delete ok on $label"
  else
    echo "post-merge: WARNING — task-616 splits soft-delete failed on $label (continuing)"
  fi
}
migrate_task_616_splits_soft_delete dev  "${DATABASE_URL:-}"
migrate_task_616_splits_soft_delete prod "${PROD_DATABASE_URL:-}"

# ── Task #624 — Press broker discount + per-SKU snapshot column ──────
# Adds `broker_discount_pct` to manufacturers (default 0) and
# `cost_snapshot_broker_discount_pct` to album_skus (nullable for
# legacy rows). Idempotent CREATE/ALTER on both DBs so the publish
# dev→prod diff (memory: dev-prod-schema-drift) doesn't try to
# DROP either column.
migrate_task_624_broker_discount() {
  local label="$1"; local url="$2"
  [ -z "$url" ] && return 0
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS broker_discount_pct integer NOT NULL DEFAULT 0;
ALTER TABLE album_skus
  ADD COLUMN IF NOT EXISTS cost_snapshot_broker_discount_pct integer;
ALTER TABLE album_skus
  ADD COLUMN IF NOT EXISTS cost_snapshot_manufacturing_discounted_cents integer;
COMMIT;
SQL
  then
    echo "post-merge: task-624 broker discount ok on $label"
  else
    echo "post-merge: WARNING — task-624 broker discount failed on $label (continuing)"
  fi
}
migrate_task_624_broker_discount dev  "${DATABASE_URL:-}"
migrate_task_624_broker_discount prod "${PROD_DATABASE_URL:-}"

# ── Task #625 — Press operational note column ────────────────────────
# Adds `operational_note` (text, nullable) to manufacturers. The
# original Task #625 merge only hand-applied this to dev; the publish
# dev→prod diff then 500'd /admin/manufacturers in prod because the
# Drizzle SELECT lists the column. Idempotent ADD COLUMN on both DBs
# so it can't drift back.
migrate_task_625_operational_note() {
  local label="$1"; local url="$2"
  [ -z "$url" ] && return 0
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS operational_note text;
SQL
  then
    echo "post-merge: task-625 operational note ok on $label"
  else
    echo "post-merge: WARNING — task-625 operational note failed on $label (continuing)"
  fi
}
migrate_task_625_operational_note dev  "${DATABASE_URL:-}"
migrate_task_625_operational_note prod "${PROD_DATABASE_URL:-}"

# ── Task #668 — Press colors get an import_source_url stamp ──────────
# The MRP color-library importer writes the canonical full-resolution
# URL on memphisrecordpressing.com to `press_colors.import_source_url`
# so a second run sees "already imported" without overwriting whatever
# the admin renamed later. Schema declares it; we hand-apply on both
# DBs (see memory: dev-prod-schema-drift / albums-schema-drift) so the
# publish dev→prod diff stays empty.
migrate_task_668_import_source_url() {
  local label="$1"; local url="$2"
  [ -z "$url" ] && return 0
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE press_colors ADD COLUMN IF NOT EXISTS import_source_url text;
SQL
  then
    echo "post-merge: task-668 import_source_url ok on $label"
  else
    echo "post-merge: WARNING — task-668 import_source_url failed on $label (continuing)"
  fi
}
migrate_task_668_import_source_url dev  "${DATABASE_URL:-}"
migrate_task_668_import_source_url prod "${PROD_DATABASE_URL:-}"

# ── Task #670 — Hellbender pricing sync audit log ───────────────────
# Adds `press_pricing_syncs` so the admin-triggered Shopify scraper can
# write its per-run log row on both dev and prod. Idempotent CREATE so
# the publish dev→prod diff (memory: dev-prod-schema-drift) doesn't try
# to drop the table when one side ran the migration and the other
# didn't yet.
migrate_task_670_pricing_syncs() {
  local label="$1"; local url="$2"
  [ -z "$url" ] && return 0
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS press_pricing_syncs (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id              varchar NOT NULL,
  source                text    NOT NULL,
  status                text    NOT NULL,
  triggered_by_user_id  varchar,
  started_at            timestamp NOT NULL DEFAULT now(),
  finished_at           timestamp,
  products_fetched      integer NOT NULL DEFAULT 0,
  colors_mapped         integer NOT NULL DEFAULT 0,
  colors_unmapped       integer NOT NULL DEFAULT 0,
  rungs_written         integer NOT NULL DEFAULT 0,
  unmapped_handles      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  proposal              jsonb,
  error                 text
);
CREATE INDEX IF NOT EXISTS press_pricing_syncs_press_started_idx
  ON press_pricing_syncs (press_id, started_at DESC);
SQL
  then
    echo "post-merge: task-670 pricing syncs ok on $label"
  else
    echo "post-merge: WARNING — task-670 pricing syncs failed on $label (continuing)"
  fi
}
migrate_task_670_pricing_syncs dev  "${DATABASE_URL:-}"
migrate_task_670_pricing_syncs prod "${PROD_DATABASE_URL:-}"

# ── Task #727 — Reset every configured GoodDeed to $25 / 20% ─────────
# Bill wants the Printed & Signed GoodDeed® cert upsell to start at $25
# retail and 20% of the vinyl run. New-cert defaults are handled in the
# SellPanel; this is the one-time reset of ALREADY-configured certs so
# old saved values ($12.99 / 100% etc.) don't keep masking the new
# default.
#
# This is a TRUE ONE-TIME backfill, NOT a per-merge reset: a marker row
# in `post_merge_data_backfills` gates it so a later operator edit (say,
# bumping a cert back to $30) is never clobbered on the next merge. The
# whole thing runs in one transaction; the guard + the writes share the
# session so a half-applied state can't strand the marker.
#
# Quantity = round(vinylRun * 0.20) capped at vinylRun, where vinylRun
# is the album's PRIMARY vinyl SKU planned_quantity (lowest-position
# vinyl-format SKU with a non-null planned run). Albums whose vinyl run
# is NULL / "as many as will sell" get the $25 price reset only and keep
# their existing quantity (20% of an unknown run can't be computed) —
# those rows are reported in the per-DB summary line below.
backfill_task_727_gooddeed_25_20() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-727 gooddeed 25/20 backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_total       integer := 0;
  v_qty_set     integer := 0;
  v_price_only  integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
    WHERE name = 'task_727_gooddeed_25_20'
  ) THEN
    -- Step 1: reset retail to $25 for every configured cert (covers the
    -- unlimited-run albums too, which keep their existing quantity).
    UPDATE album_addons
       SET price_cents = 2500
     WHERE kind = 'signed_cert';
    GET DIAGNOSTICS v_total = ROW_COUNT;

    -- Step 2: reset quantity to 20% of the primary vinyl run, rounded
    -- and capped at the run. Only albums with a fixed vinyl run match.
    UPDATE album_addons a
       SET planned_quantity = LEAST(
             GREATEST(round(v.vinyl_run * 0.20)::int, 0),
             v.vinyl_run
           )
      FROM (
        SELECT DISTINCT ON (s.album_id)
               s.album_id,
               s.planned_quantity AS vinyl_run
          FROM album_skus s
         WHERE s.format IN ('12_33_single','12_33_double','12_45','7_45')
           AND s.planned_quantity IS NOT NULL
         ORDER BY s.album_id, s.position ASC
      ) v
     WHERE a.kind = 'signed_cert'
       AND a.album_id = v.album_id;
    GET DIAGNOSTICS v_qty_set = ROW_COUNT;

    v_price_only := v_total - v_qty_set;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_727_gooddeed_25_20');

    RAISE NOTICE 'task-727 backfill applied: % certs reset to $25, % got 20%% qty, % price-only (unlimited run)',
      v_total, v_qty_set, v_price_only;
  ELSE
    RAISE NOTICE 'task-727 backfill already applied — skipping (operator edits preserved)';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-727 gooddeed 25/20 backfill ok on $label"
    echo "$out" | grep -i 'task-727' || true
  else
    echo "post-merge: WARNING — task-727 gooddeed 25/20 backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_727_gooddeed_25_20 dev  "${DATABASE_URL:-}"
backfill_task_727_gooddeed_25_20 prod "${PROD_DATABASE_URL:-}"

# ─── Task #922 — Per-album NPO donation split ──────────────────────────
# Schema-only DDL: the album_npo_beneficiaries table plus the referral_credits
# unique-index swap (one (order_id) WHERE kind='artist' + one
# (order_id, referrer_org_id) WHERE kind='non_profit', replacing the old
# (order_id, referrer_kind) unique that blocked >1 NPO credit per order).
# Idempotent CREATE/DROP IF EXISTS so it is safe on every merge, dev+prod.
migrate_task_922_npo_split() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-922 npo-split migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS album_npo_beneficiaries (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id             varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  organization_id      varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  per_unit_cents       integer NOT NULL,
  allocated_by_user_id varchar,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT album_npo_beneficiaries_per_unit_chk CHECK (per_unit_cents > 0 AND per_unit_cents <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS album_npo_beneficiaries_album_org_uniq
  ON album_npo_beneficiaries (album_id, organization_id);
-- Swap the referral_credits unique. The old one may be a constraint or a
-- bare index depending on how an environment's DB was built — drop both.
ALTER TABLE referral_credits DROP CONSTRAINT IF EXISTS referral_credits_order_kind_uniq;
DROP INDEX IF EXISTS referral_credits_order_kind_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS referral_credits_order_artist_uniq
  ON referral_credits (order_id) WHERE referrer_kind = 'artist';
CREATE UNIQUE INDEX IF NOT EXISTS referral_credits_order_org_uniq
  ON referral_credits (order_id, referrer_org_id) WHERE referrer_kind = 'non_profit';
COMMIT;
SQL
  then
    echo "post-merge: task-922 npo-split migration ok on $label"
  else
    echo "post-merge: WARNING — task-922 npo-split migration failed on $label (continuing)"
  fi
}
migrate_task_922_npo_split dev  "${DATABASE_URL:-}"
migrate_task_922_npo_split prod "${PROD_DATABASE_URL:-}"

# One-time data backfill: every album whose primary artist carries an NPO
# referral (people.referred_by_org_id) and that has NO explicit beneficiary
# yet gets a single default beneficiary at the artist's referrer_per_unit_cents
# (clamped to 1..100). Marker-guarded in post_merge_data_backfills so a later
# operator edit (re-split, remove) is never clobbered on the next merge.
backfill_task_922_npo_default() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-922 npo-default backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_922_npo_default'
  ) THEN
    INSERT INTO album_npo_beneficiaries (album_id, organization_id, per_unit_cents)
    SELECT a.id, p.referred_by_org_id,
           GREATEST(LEAST(COALESCE(p.referrer_per_unit_cents, 100), 100), 1)
      FROM albums a
      JOIN people p ON p.id = a.primary_artist_id
     WHERE p.referred_by_org_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM album_npo_beneficiaries b WHERE b.album_id = a.id
       )
    ON CONFLICT (album_id, organization_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_922_npo_default');
    RAISE NOTICE 'task-922 backfill applied: % default beneficiaries minted', v_inserted;
  ELSE
    RAISE NOTICE 'task-922 backfill already applied — skipping (operator edits preserved)';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-922 npo-default backfill ok on $label"
    echo "$out" | grep -i 'task-922' || true
  else
    echo "post-merge: WARNING — task-922 npo-default backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_922_npo_default dev  "${DATABASE_URL:-}"
backfill_task_922_npo_default prod "${PROD_DATABASE_URL:-}"

# ─── Task #533 — Pool-funded early masters cut ─────────────────────────
# New ledger + queue tables and the per-album pool / consent columns plus
# the per-press auto-trigger consent columns. Schema-only DDL — idempotent
# CREATE TABLE / ADD COLUMN IF NOT EXISTS so it's safe to re-run on every
# merge against both dev and prod. No data backfill: the pool starts at
# zero on rollout (pre-rollout sales do not retroactively contribute).
migrate_task_533_early_cut() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-533 early-cut migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS albums
  ADD COLUMN IF NOT EXISTS press_pool_accrued_cents     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS press_pool_released_cents    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_cut_consent_at         timestamp,
  ADD COLUMN IF NOT EXISTS early_cut_consent_by_user_id varchar,
  ADD COLUMN IF NOT EXISTS early_cut_consent_for_tier_name text,
  ADD COLUMN IF NOT EXISTS early_cut_consent_for_format    text;
ALTER TABLE IF EXISTS manufacturers
  ADD COLUMN IF NOT EXISTS auto_trigger_consent_at timestamp,
  ADD COLUMN IF NOT EXISTS auto_trigger_consent_by varchar;
CREATE TABLE IF NOT EXISTS album_press_pool_ledger (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id       varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  kind           text    NOT NULL,
  cents          integer NOT NULL,
  source_order_id varchar,
  note           text,
  occurred_at    timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS album_press_pool_ledger_accrue_order_uniq
  ON album_press_pool_ledger (album_id, source_order_id)
  WHERE kind = 'accrue' AND source_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS album_press_pool_ledger_deaccrue_order_uniq
  ON album_press_pool_ledger (album_id, source_order_id)
  WHERE kind = 'deaccrue' AND source_order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS press_early_cut_queue (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id               varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  press_id               varchar NOT NULL,
  status                 text    NOT NULL DEFAULT 'pending',
  press_floor_total_cents integer NOT NULL,
  pool_available_cents   integer NOT NULL,
  units_sold             integer NOT NULL DEFAULT 0,
  tier_name              text,
  format                 text,
  decline_reason         text,
  created_at             timestamp NOT NULL DEFAULT now(),
  decided_at             timestamp,
  decided_by_user_id     varchar
);
CREATE UNIQUE INDEX IF NOT EXISTS press_early_cut_queue_pending_album_uniq
  ON press_early_cut_queue (album_id)
  WHERE status = 'pending';
COMMIT;
SQL
  then
    echo "post-merge: task-533 early-cut migration ok on $label"
  else
    echo "post-merge: WARNING — task-533 early-cut migration failed on $label (continuing)"
  fi
}
migrate_task_533_early_cut dev  "${DATABASE_URL:-}"
migrate_task_533_early_cut prod "${PROD_DATABASE_URL:-}"

# Task #534 — Partner notifications (multi-recipient + heads-up email).
# Two new tables: partner_notification_recipients (who hears about a
# partner's events) + partner_notification_log (one row per delivery
# attempt). Idempotent CREATE TABLE on both DBs so a fresh-clone dev
# never 500s the recipient CRUD and the publish dev→prod diff stays
# empty (these tables are otherwise prod-missing on first ship).
migrate_partner_notifications() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping partner_notifications migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS partner_notification_recipients (
  id           varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_kind text      NOT NULL,
  partner_id   varchar   NOT NULL,
  name         text      NOT NULL,
  channel      text      NOT NULL DEFAULT 'email',
  address      text      NOT NULL,
  role         text      NOT NULL DEFAULT 'ops',
  events       jsonb     NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamp DEFAULT now(),
  deleted_at   timestamp
);
CREATE INDEX IF NOT EXISTS partner_notif_recipients_partner_idx
  ON partner_notification_recipients (partner_kind, partner_id);
CREATE TABLE IF NOT EXISTS partner_notification_log (
  id               varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id     varchar   NOT NULL REFERENCES partner_notification_recipients(id) ON DELETE CASCADE,
  event_type       text      NOT NULL,
  payload_snapshot jsonb,
  status           text      NOT NULL,
  sent_at          timestamp DEFAULT now(),
  error            text
);
CREATE INDEX IF NOT EXISTS partner_notif_log_recipient_idx
  ON partner_notification_log (recipient_id);
SQL
  then
    echo "post-merge: partner_notifications migration ok on $label"
  else
    echo "post-merge: WARNING — partner_notifications migration failed on $label (continuing)"
  fi
}
migrate_partner_notifications dev  "${DATABASE_URL:-}"
migrate_partner_notifications prod "${PROD_DATABASE_URL:-}"

# Task #734 — Stream-elsewhere credited tracks. Added four nullable
# columns that the publish dev→prod diff failed to carry, so prod was
# left missing them: customer_users.favorite_streaming_service (the
# fan's preferred service for handoffs) plus songs.stream_only /
# songs.spotify_track_url / songs.apple_music_track_url (per-track
# stream-elsewhere routing). The missing customer_users column 500s the
# full-column login lookup (Google/Apple/email all funnel through it),
# and the missing songs columns 500 any songs select (player/track
# lists). Idempotent ADD COLUMN IF NOT EXISTS on both DBs so login is
# restored, the player loads, and the publish dev→prod diff stays empty.
migrate_task_734_stream_elsewhere() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-734 stream-elsewhere migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS favorite_streaming_service text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS stream_only boolean NOT NULL DEFAULT false;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_track_url text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS apple_music_track_url text;
SQL
  then
    echo "post-merge: task-734 stream-elsewhere migration ok on $label"
  else
    echo "post-merge: WARNING — task-734 stream-elsewhere migration failed on $label (continuing)"
  fi
}
migrate_task_734_stream_elsewhere dev  "${DATABASE_URL:-}"
migrate_task_734_stream_elsewhere prod "${PROD_DATABASE_URL:-}"

# Task #736 — Press mode (Dedicated vs All Presses) god-view toggle.
# Added people.press_mode + labels.press_mode but shipped without a
# post-merge migration, so both columns went missing on main-dev AND
# prod. Admin People (artist) and Label pages do full-column selects on
# these tables, so the missing columns 500 those admin surfaces. Nullable
# text (NULL = resolver default "dedicated"). Idempotent ADD COLUMN IF
# NOT EXISTS on both DBs so admin loads and the publish dev→prod diff
# stays empty.
migrate_task_736_press_mode() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-736 press_mode migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE people ADD COLUMN IF NOT EXISTS press_mode text;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS press_mode text;
SQL
  then
    echo "post-merge: task-736 press_mode migration ok on $label"
  else
    echo "post-merge: WARNING — task-736 press_mode migration failed on $label (continuing)"
  fi
}
migrate_task_736_press_mode dev  "${DATABASE_URL:-}"
migrate_task_736_press_mode prod "${PROD_DATABASE_URL:-}"

# Latent schema drift sweep — objects that landed in shared/schema.ts
# without a matching post-merge migration, so they never reached main-dev
# or prod and 500 the moment active code touches them:
#   - phone_otp_codes.last_sent_at — phoneOtp.ts reads existing.lastSentAt;
#     the original CREATE TABLE block above predates this column, so existing
#     DBs need the ALTER (fresh clones get it here too since this runs after).
#   - shopify_push_log — shopify.ts insert/select on every catalog push.
#   - print_generations / print_artifacts — storage.ts print-PDF history
#     (artifacts FK→generations, so create generations first).
# Idempotent on both DBs so the publish dev→prod diff stays empty.
migrate_latent_drift_sweep() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping latent-drift sweep on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE phone_otp_codes ADD COLUMN IF NOT EXISTS last_sent_at timestamp NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS shopify_push_log (
  id            varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      varchar   NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  store_id      varchar   NOT NULL,
  product_id    varchar   NOT NULL,
  action        text      NOT NULL,
  forced        boolean   NOT NULL DEFAULT false,
  conflicts     text[],
  actor_user_id varchar,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS print_generations (
  id                    varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id              varchar   NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  vendor_id             text      NOT NULL,
  created_by_user_id    varchar,
  override_justification text,
  created_at            timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS print_artifacts (
  id             varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id  varchar   NOT NULL REFERENCES print_generations(id) ON DELETE CASCADE,
  template_id    text      NOT NULL,
  template_label text      NOT NULL,
  file_name      text      NOT NULL,
  asset_url      text      NOT NULL,
  size_bytes     integer   NOT NULL,
  created_at     timestamp NOT NULL DEFAULT now()
);
SQL
  then
    echo "post-merge: latent-drift sweep ok on $label"
  else
    echo "post-merge: WARNING — latent-drift sweep failed on $label (continuing)"
  fi
}
migrate_latent_drift_sweep dev  "${DATABASE_URL:-}"
migrate_latent_drift_sweep prod "${PROD_DATABASE_URL:-}"

# Task #793 — 7" booklet becomes an either/or VARIANT (7" alone vs
# 7" + booklet at a flat set price), not a stacked add-on. Two new
# columns ship in shared/schema.ts:
#   - album_addons.bundle_price_cents — the flat "with booklet" set
#     price for the 7" anchor (nullable; NULL falls back to sku price
#     + addon price so legacy standalone booklet add-ons map to "with
#     booklet" without double-charging).
#   - order_copies.booklet — per-copy record of whether the booklet was
#     included in that physical copy (default false).
# buy-options/checkout/materialize all read these, so the columns must
# exist on both DBs. Idempotent ADD COLUMN IF NOT EXISTS so the publish
# dev→prod diff stays empty.
migrate_task_793_booklet_bundle() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-793 booklet-bundle migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE album_addons ADD COLUMN IF NOT EXISTS bundle_price_cents integer;
ALTER TABLE order_copies  ADD COLUMN IF NOT EXISTS booklet boolean NOT NULL DEFAULT false;
SQL
  then
    echo "post-merge: task-793 booklet-bundle migration ok on $label"
  else
    echo "post-merge: WARNING — task-793 booklet-bundle migration failed on $label (continuing)"
  fi
}
migrate_task_793_booklet_bundle dev  "${DATABASE_URL:-}"
migrate_task_793_booklet_bundle prod "${PROD_DATABASE_URL:-}"

# Task #824 — person-level creative-credit tags. `people.roles` is a
# text[] of the "hats" a person wears (Artist / Producer / Writer /
# Performer / …), set by the unified role picker on the People adds and
# the person Overview. Must exist on both DBs so the publish dev→prod
# diff stays empty and the GET /api/admin/people/:id read doesn't 500.
# Idempotent ADD COLUMN IF NOT EXISTS with the same default the schema
# declares ('{}').
migrate_task_824_person_roles() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-824 person-roles migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE people ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';
SQL
  then
    echo "post-merge: task-824 person-roles migration ok on $label"
  else
    echo "post-merge: WARNING — task-824 person-roles migration failed on $label (continuing)"
  fi
}
migrate_task_824_person_roles dev  "${DATABASE_URL:-}"
migrate_task_824_person_roles prod "${PROD_DATABASE_URL:-}"

# Task #860 — Terms acceptance at sign-up. Additive nullable columns on
# both account tables (users = admin/partner, customer_users = fan):
# `terms_accepted_at` (timestamp) + `terms_version` (text). NULL for
# accounts created before this shipped — no re-consent. Idempotent
# ADD COLUMN IF NOT EXISTS on both DBs so a fresh-clone dev never 500s
# the auth serializers and the publish dev->prod diff stays empty.
migrate_task_860_terms_consent() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-860 terms-consent migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp,
  ADD COLUMN IF NOT EXISTS terms_version     text;
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp,
  ADD COLUMN IF NOT EXISTS terms_version     text;
SQL
  then
    echo "post-merge: task-860 terms-consent migration ok on $label"
  else
    echo "post-merge: WARNING — task-860 terms-consent migration failed on $label (continuing)"
  fi
}
migrate_task_860_terms_consent dev  "${DATABASE_URL:-}"
migrate_task_860_terms_consent prod "${PROD_DATABASE_URL:-}"

# ─── Task #862 — Backfill OAuth-verified fans as email-verified ─────────
# Fans who signed up / signed in with Google (and Apple non-relay) had the
# provider's email_verified flag read off the token but never recorded, so
# customer_users.email_verified_at stayed NULL and they show as UNVERIFIED
# in admin even though the provider already proved their email — and we
# correctly never sent them a GoodTunes verification email. The OAuth
# callback now stamps this going forward; this one-time backfill clears
# everyone already affected (e.g. Andrew Goeken / agshorty8@gmail.com).
#
# A row is eligible when its email_verified_at IS NULL AND it has a linked
# customer_identities row for a provider that implies a verified real
# address: provider = 'google' (always), OR provider = 'apple' with a
# non-relay email (we never treat @privaterelay.appleid.com masks as a
# verifiable real address). We use the identity's linked_at as the stamp,
# falling back to now() when it's missing.
#
# TRUE ONE-TIME backfill gated by a marker row in post_merge_data_backfills
# so a later operator action is never clobbered on the next merge. Safe on
# both dev and prod, safe to re-run. Additive UPDATE only — never clears a
# verification that already exists.
backfill_task_862_oauth_email_verified() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-862 oauth email-verified backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
    WHERE name = 'task_862_oauth_email_verified'
  ) THEN
    WITH verified_identity AS (
      SELECT ci.user_id, MIN(COALESCE(ci.linked_at, now())) AS stamp
        FROM customer_identities ci
       WHERE ci.provider = 'google'
          OR (ci.provider = 'apple'
              AND ci.email IS NOT NULL
              AND ci.email NOT ILIKE '%@privaterelay.appleid.com')
       GROUP BY ci.user_id
    )
    UPDATE customer_users cu
       SET email_verified_at = vi.stamp
      FROM verified_identity vi
     WHERE cu.id = vi.user_id
       AND cu.email_verified_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_862_oauth_email_verified');

    RAISE NOTICE 'task-862 backfill applied: % oauth fans stamped email-verified', v_count;
  ELSE
    RAISE NOTICE 'task-862 backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-862 oauth email-verified backfill ok on $label"
    echo "$out" | grep -i 'task-862' || true
  else
    echo "post-merge: WARNING — task-862 oauth email-verified backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_862_oauth_email_verified dev  "${DATABASE_URL:-}"
backfill_task_862_oauth_email_verified prod "${PROD_DATABASE_URL:-}"

# ─── Task #898/#915 — Display-derivative backfill for oversized art ─────
# New admin uploads keep a full-res ".orig" sibling + serve a downsized
# (~1500px) display image (server/imageProcessing.ts). This pass applies the
# same to art uploaded BEFORE that change — chiefly the prod-only oversized
# album art that OOM-crashed GoodDeed rendering AND (Daniel Lew "Destiny",
# ~178MP) crashed mobile album pages by serving the raw original.
#
# Task #915: the first pass marked itself "done" even though "Destiny" was
# ABOVE the old 64MP decode ceiling and got skipped. The pipeline now has a
# memory-safe libvips (sharp) shrink-on-load path for over-ceiling art, the
# script uses a fresh `task_898_display_derivatives_v2` marker so the
# corrected pass re-runs, and it ONLY stamps that marker when nothing errored
# (a failed conversion stays re-runnable on the next merge). The script is
# idempotent (skips anything whose ".orig" sibling already exists). Object
# Storage is shared dev↔prod, so converting either DB's URLs benefits both.
#
# Run DETACHED in the background: downloading + re-encoding multi-MB source
# images (some 5792×8688 ~5 MB) is far too slow to fit inside the post-merge
# harness's wall-clock budget, and blocking it timed the whole merge out. The
# marker + ".orig"-exists idempotency mean a run that's killed mid-pass simply
# resumes (skipping already-converted images) on the next merge until it
# completes and stamps its marker — so backgrounding is safe and never blocks.
backfill_task_898_display_derivatives() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-898 display-derivative backfill on $label (no URL set)"
    return 0
  fi
  local logf="/tmp/backfill-display-derivatives-${label}.log"
  echo "post-merge: launching task-898 display-derivative backfill on $label in background (log: $logf)"
  DATABASE_URL="$url" nohup timeout 1800 npx tsx scripts/backfill-display-derivatives.ts \
    >"$logf" 2>&1 &
  disown 2>/dev/null || true
  return 0
}
backfill_task_898_display_derivatives dev  "${DATABASE_URL:-}"
backfill_task_898_display_derivatives prod "${PROD_DATABASE_URL:-}"

# ─── Task #916 — production-partner capability flags on `manufacturers` ─────
# Additive schema: three boolean capability flags + an at-least-one CHECK.
# does_vinyl defaults TRUE so every existing press auto-backfills as a vinyl
# plant (they all are today). Idempotent (IF NOT EXISTS + pg_constraint guard),
# safe on dev + prod, safe to re-run. Mirrors the standalone reference SQL in
# scripts/prod-schema-fixups/2026-06-02-task-916-manufacturer-capabilities.sql.
migrate_manufacturer_capabilities() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-916 manufacturer-capabilities migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS does_vinyl       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS does_good_deed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS does_fulfillment boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'manufacturers_capability_at_least_one'
  ) THEN
    ALTER TABLE manufacturers
      ADD CONSTRAINT manufacturers_capability_at_least_one
      CHECK (does_vinyl OR does_good_deed OR does_fulfillment);
  END IF;
END
$$;
COMMIT;
SQL
  then
    echo "post-merge: task-916 manufacturer-capabilities migration ok on $label"
  else
    echo "post-merge: WARNING — task-916 manufacturer-capabilities migration failed on $label (continuing)"
  fi
}
migrate_manufacturer_capabilities dev  "${DATABASE_URL:-}"
migrate_manufacturer_capabilities prod "${PROD_DATABASE_URL:-}"

# ─── Task #916 — real-data capability flips (domain-keyed, ID-drift safe) ───
# Hoover Printing is GoodDeeds-only (prints certs, presses no vinyl); MRP
# (Memphis Record Pressing) does all three. Keyed by DOMAIN, not id, because
# manufacturer ids drift dev↔prod (see .agents/memory/press-roster-dev-prod-drift.md).
# TRUE ONE-TIME backfill gated by a marker in post_merge_data_backfills so a
# later operator edit (flipping a flag in the admin UI) is never clobbered on
# the next merge. Domain match is ILIKE-loose so a stored "www." or trailing
# slash still resolves. Safe on dev + prod, safe to re-run.
backfill_task_916_capability_flips() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-916 capability-flip backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_hoover integer := 0;
  v_mrp    integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
    WHERE name = 'task_916_capability_flips'
  ) THEN
    -- Hoover Printing → GoodDeeds-only.
    UPDATE manufacturers
       SET does_vinyl = false, does_good_deed = true
     WHERE deleted_at IS NULL
       AND (domain ILIKE '%hooverprinting%' OR name ILIKE '%hoover%');
    GET DIAGNOSTICS v_hoover = ROW_COUNT;

    -- Memphis Record Pressing (MRP) → all three capabilities.
    UPDATE manufacturers
       SET does_vinyl = true, does_good_deed = true, does_fulfillment = true
     WHERE deleted_at IS NULL
       AND (domain ILIKE '%memphisrecordpressing%'
            OR name ILIKE '%memphis record pressing%'
            OR name ILIKE '%MRP%');
    GET DIAGNOSTICS v_mrp = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_916_capability_flips');

    RAISE NOTICE 'task-916 capability flips applied: hoover=% mrp=%', v_hoover, v_mrp;
  ELSE
    RAISE NOTICE 'task-916 capability flips already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-916 capability-flip backfill ok on $label"
    echo "$out" | grep -i 'task-916' || true
  else
    echo "post-merge: WARNING — task-916 capability-flip backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_916_capability_flips dev  "${DATABASE_URL:-}"
backfill_task_916_capability_flips prod "${PROD_DATABASE_URL:-}"

# ─── Task #939 — App Store / Play Store review demo account + Sampler ───
# Seeds a sealed reviewer fan account (appreview@goodtunes.music) that owns
# one published "GoodTunes Sampler" EP with three fully-playable tracks
# (real Mux masters + lyrics + song credits + a linked Person + a linked
# Instrument). Ownership is granted via a real user_albums row (NO purchase)
# so the album shows in Library and plays end-to-end with no Buy/Chat
# surfaces. Idempotent + ID-preserving (ON CONFLICT (id) DO NOTHING) so it
# is convergent and never clobbers later operator edits. Songs are copied
# with INSERT…SELECT from static-seed source rows (album-1 / album-5) so
# each environment inherits ITS OWN valid Mux ids + lyrics — Mux is a shared
# account so the ids resolve in dev and prod regardless. The committed value
# below is a scrypt PASSWORD HASH, never the plaintext; the plaintext is
# surfaced to Bill out-of-band and rotated per submission via the admin
# reset flow (rotation is never re-clobbered here because of DO NOTHING).
seed_task_939_appreview_demo() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-939 appreview-demo seed on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
BEGIN;

INSERT INTO customer_users
  (id, username, email, display_name, real_name, password, handle,
   contact_email, email_verified_at, signup_completed_at, onboarded_at,
   terms_accepted_at, terms_version, created_at)
VALUES
  ('cust-appreview-demo', 'appreview', 'appreview@goodtunes.music',
   'App Review', 'App Review',
   '214c5160deb18127ed0ac2ebf660ee4518323494fd17017992b32f15c636d0d6b8ae9715af5c4fa83a607d3347699fa3bcc1236d095605a43705a3e9b4f3fdb9.e14b9982ffe04c43a45bf14f30de2773',
   'appreview', 'appreview@goodtunes.music',
   now(), now(), now(), now(), '2026-05-31', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO people (id, name, photo_url, bio)
VALUES ('person-sampler-artist', 'GoodTunes Sampler',
        '/figmaAssets/album-5-cover.jpg',
        'Demo artist used for the GoodTunes Sampler — a compilation assembled for app-store review.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (id, name, domain, is_maker, is_reseller, home_url, created_at)
VALUES ('vendor-sampler-martin', 'Martin Guitar', 'sampler-martin.goodtunes.music',
        true, true, 'https://www.martinguitar.com', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO instruments (id, name, category, photo_url, about, maker_vendor_id, source_url)
VALUES ('instrument-sampler-guitar', 'Martin D-28 Acoustic Guitar', 'Acoustic Guitar',
        '/objects/uploads/6c2bfaab-5064-49a2-bad8-4dee17a7cc52.jpg',
        'The dreadnought heard across the GoodTunes Sampler.',
        'vendor-sampler-martin', 'https://www.martinguitar.com/guitars/standard/d-28/')
ON CONFLICT (id) DO NOTHING;

INSERT INTO instrument_vendors (id, instrument_id, vendor_id, affiliate_url, position, is_hidden, created_at)
VALUES ('iv-sampler-1', 'instrument-sampler-guitar', 'vendor-sampler-martin',
        'https://www.martinguitar.com/guitars/standard/d-28/', 0, false, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO albums
  (id, title, artist, artwork, year, type, description, genre,
   good_tunes_release_date, is_goodtunes_release, is_prepping, is_hidden,
   primary_artist_id)
VALUES
  ('album-sampler', 'GoodTunes Sampler', 'GoodTunes Sampler',
   '/figmaAssets/album-5-cover.jpg', 2026, 'EP',
   'A short sampler of fully-playable GoodTunes tracks, assembled for app-store review.',
   'Indie', '2026-06-01', true, false, false, 'person-sampler-artist')
ON CONFLICT (id) DO NOTHING;

INSERT INTO songs
  (id, album_id, title, track_number, duration, lyrics, synced_lyrics,
   audio_url, mux_playback_id, mux_asset_id, mux_status)
SELECT 'song-sampler-1', 'album-sampler', title, 1, duration, lyrics,
       synced_lyrics, audio_url, mux_playback_id, mux_asset_id, mux_status
FROM songs WHERE id = 'song-1-1'
ON CONFLICT (id) DO NOTHING;

INSERT INTO songs
  (id, album_id, title, track_number, duration, lyrics, synced_lyrics,
   audio_url, mux_playback_id, mux_asset_id, mux_status)
SELECT 'song-sampler-2', 'album-sampler', title, 2, duration, lyrics,
       synced_lyrics, audio_url, mux_playback_id, mux_asset_id, mux_status
FROM songs WHERE id = 'song-5-1'
ON CONFLICT (id) DO NOTHING;

INSERT INTO songs
  (id, album_id, title, track_number, duration, lyrics, synced_lyrics,
   audio_url, mux_playback_id, mux_asset_id, mux_status)
SELECT 'song-sampler-3', 'album-sampler', title, 3, duration, lyrics,
       synced_lyrics, audio_url, mux_playback_id, mux_asset_id, mux_status
FROM songs WHERE id = 'song-5-6'
ON CONFLICT (id) DO NOTHING;

INSERT INTO track_performers (id, song_id, person_id, instrument_id, name, role, position) VALUES
  ('tp-sampler-1a', 'song-sampler-1', 'person-sampler-artist', 'instrument-sampler-guitar', 'GoodTunes Sampler', 'Vocals · Acoustic Guitar', 0),
  ('tp-sampler-1b', 'song-sampler-1', 'person-sampler-artist', NULL, 'GoodTunes Sampler', 'Lead Vocals', 1),
  ('tp-sampler-2a', 'song-sampler-2', 'person-sampler-artist', 'instrument-sampler-guitar', 'GoodTunes Sampler', 'Acoustic Guitar', 0),
  ('tp-sampler-3a', 'song-sampler-3', 'person-sampler-artist', NULL, 'GoodTunes Sampler', 'Lead Vocals', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO track_writers (id, song_id, person_id, name, role, position) VALUES
  ('tw-sampler-1a', 'song-sampler-1', 'person-sampler-artist', 'GoodTunes Sampler', 'Composer', 0),
  ('tw-sampler-1b', 'song-sampler-1', 'person-sampler-artist', 'GoodTunes Sampler', 'Lyricist', 1),
  ('tw-sampler-2a', 'song-sampler-2', 'person-sampler-artist', 'GoodTunes Sampler', 'Composer', 0),
  ('tw-sampler-3a', 'song-sampler-3', 'person-sampler-artist', 'GoodTunes Sampler', 'Composer', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO album_credits (id, album_id, person_id, name, role, position) VALUES
  ('ac-sampler-1', 'album-sampler', 'person-sampler-artist', 'GoodTunes Sampler', 'Produced by', 0),
  ('ac-sampler-2', 'album-sampler', 'person-sampler-artist', 'GoodTunes Sampler', 'Mixed by', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_albums (id, user_id, album_id, is_preview)
VALUES ('ua-appreview-sampler', 'cust-appreview-demo', 'album-sampler', false)
ON CONFLICT (id) DO NOTHING;

-- Task #1336 — also grant the REAL "Love Life Tragedy" album (Nick Carter)
-- so the App Review reviewer logs into a full GoodTunes release WITH bonus
-- videos (2) + bonus photos (2) + 17 fully-playable Mux tracks, not just the
-- 3-track Sampler. LLT is prod-only data, so this is an INSERT…SELECT keyed on
-- the confirmed prod album id: it grants ownership on prod where the row
-- exists, and silently no-ops on a fresh dev clone where it doesn't. Ownership
-- via a real user_albums row (is_preview=false) is exactly what the playback +
-- bonus-content gate checks, so audio/video/photos all unlock with no Buy/Chat.
INSERT INTO user_albums (id, user_id, album_id, is_preview)
SELECT 'ua-appreview-llt', 'cust-appreview-demo', a.id, false
FROM albums a
WHERE a.id = '4ee3d6b9-d01f-4573-b1d6-c60951c67211'
ON CONFLICT (id) DO NOTHING;

COMMIT;
SQL
  ); then
    echo "post-merge: task-939 appreview-demo seed ok on $label"
  else
    echo "post-merge: WARNING — task-939 appreview-demo seed failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
seed_task_939_appreview_demo dev  "${DATABASE_URL:-}"
seed_task_939_appreview_demo prod "${PROD_DATABASE_URL:-}"

# ─── Task #1088 — drop the "HB##" code prefix from Memphis color NAMES ──────
# Memphis Record Pressing's "Metallic Blends" colors were imported as
# "HB01 Metallic Gold", "HB12 Go Tigers!", etc. The "HB" reads as
# Hellbender at a glance and the code is redundant (it stays recoverable
# via each row's import_source_url + the manifest `code` field). Strip a
# leading "HB<digits><space(s)>" prefix from press_colors.name, scoped
# STRICTLY to Memphis's "Metallic Blends" tier rows (joined press_colors →
# press_color_tiers → manufacturers, matched by domain/name like the
# task-916 flips, ID-drift safe). The regexp only removes the code prefix:
# "HB12 Go Tigers!" → "Go Tigers!" (the "!" and the rest are untouched);
# names with no prefix are left exactly as-is. TRUE ONE-TIME backfill gated
# by a marker in post_merge_data_backfills so a later operator rename is
# never clobbered on a subsequent merge. Runs on BOTH dev and prod (prod
# SQL is read-only from tooling + task dev DBs are throwaway, so the reset
# must run at merge time against both). Hellbender + every other press is
# untouched. Idempotent + safe to re-run.
backfill_task_1088_memphis_color_names() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1088 Memphis color-name backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
    WHERE name = 'task_1088_memphis_color_names'
  ) THEN
    UPDATE press_colors c
       SET name = regexp_replace(c.name, '^HB[0-9]+\s+', '')
      FROM press_color_tiers t
      JOIN manufacturers m ON m.id = t.press_id
     WHERE c.tier_id = t.id
       AND t.name = 'Metallic Blends'
       AND (m.domain ILIKE '%memphisrecordpressing%'
            OR m.name ILIKE '%memphis record pressing%'
            OR m.name ILIKE '%MRP%')
       AND c.name ~ '^HB[0-9]+\s+';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_1088_memphis_color_names');

    RAISE NOTICE 'task-1088 Memphis color-name backfill applied: % rows stripped', v_count;
  ELSE
    RAISE NOTICE 'task-1088 Memphis color-name backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1088 Memphis color-name backfill ok on $label"
    echo "$out" | grep -i 'task-1088' || true
  else
    echo "post-merge: WARNING — task-1088 Memphis color-name backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1088_memphis_color_names dev  "${DATABASE_URL:-}"
backfill_task_1088_memphis_color_names prod "${PROD_DATABASE_URL:-}"

# ─── Task #1113 — reconcile shared/schema.ts drift the schema-drift guard ───
# found. These objects exist in shared/schema.ts but had never shipped a
# matching migrate_* block, so neither dev nor prod ever got them — the exact
# failure mode the schema-drift-smoke validation now catches (see
# .agents/memory/albums-schema-drift.md). All statements are additive and
# idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS), safe to
# run on every merge and on DBs that already have them. Runs on BOTH dev and
# prod because the published app SELECTs/UPDATEs these columns directly.
#
# When the guard flags a NEW missing table.column pair, append the matching
# ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS here (mirror the
# shared/schema.ts definition) — that is the documented fix.
migrate_task_1113_schema_drift() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1113 schema-drift migration on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
BEGIN;
-- order_items.fulfiller (Task #844 custom-addon fulfiller snapshot)
-- order_items.recipient_mode (Task #1630 custom-addon anonymous/specific)
ALTER TABLE IF EXISTS order_items
  ADD COLUMN IF NOT EXISTS fulfiller text,
  ADD COLUMN IF NOT EXISTS recipient_mode text;

-- Soft-delete trio on the split tables (Task #616). deleted_at already
-- shipped; the audit columns drifted.
ALTER TABLE IF EXISTS track_mechanical_splits
  ADD COLUMN IF NOT EXISTS deleted_by_user_id     varchar,
  ADD COLUMN IF NOT EXISTS deleted_via_parent_id  varchar;
ALTER TABLE IF EXISTS track_publishing_splits
  ADD COLUMN IF NOT EXISTS deleted_by_user_id     varchar,
  ADD COLUMN IF NOT EXISTS deleted_via_parent_id  varchar;

-- vendor_gooddeed_services — per-vendor GoodDeed service pricing rows.
CREATE TABLE IF NOT EXISTS vendor_gooddeed_services (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           varchar NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service             text    NOT NULL,
  active              boolean NOT NULL DEFAULT false,
  tiers_json          jsonb,
  size_ladders_json   jsonb,
  flat_per_unit_cents integer,
  setup_fee_cents     integer NOT NULL DEFAULT 0,
  min_batch           integer NOT NULL DEFAULT 25,
  lead_time_days      integer NOT NULL DEFAULT 14,
  ship_to_default     text,
  notes               text,
  updated_by_user_id  varchar,
  updated_at          timestamp NOT NULL DEFAULT now(),
  created_at          timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_gooddeed_services_vendor_service_uniq
  ON vendor_gooddeed_services (vendor_id, service);
COMMIT;
SQL
  ); then
    echo "post-merge: task-1113 schema-drift migration ok on $label"
  else
    echo "post-merge: WARNING — task-1113 schema-drift migration failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
migrate_task_1113_schema_drift dev  "${DATABASE_URL:-}"
migrate_task_1113_schema_drift prod "${PROD_DATABASE_URL:-}"

# ─── Task #1189 — one-time cleanup of auto-granted standard albums ─────────
# We removed the createUser seed-album auto-grant (every new account used to
# silently receive the four standard demos — album-1..4 — plus, because the
# old loop ran over the whole albums table, any other catalog album that
# existed at signup time). This backfill scrubs the rows that auto-grant
# already left behind so no account holds a free standard album going forward.
#
# Target signature (auto-granted STANDARD albums only):
#   - album_id IN (album-1..4)
#   - is_preview = false            → never touch an ACTIVE DEMO/preview
#   - certificate_number IN (12,7,3,21) → the EXACT seed cert signature the
#       auto-grant stamps; deliberate comps insert a NULL cert, real
#       purchases insert a NULL cert too (the GoodDeed number lives on the
#       orders row), so this cleanly isolates auto-grants from both.
#   - NO backing paid order (status paid/shipped) for that fan+album → belt
#       and suspenders so a purchase can never be deleted even if its cert
#       column ever collided with a seed number.
# This preserves purchases, active demos, and deliberate comps exactly as the
# task requires. It is DESTRUCTIVE, so we RAISE a dry-run breakdown (total +
# per-album counts of what WILL be removed) before deleting. Marker-guarded
# in post_merge_data_backfills so it runs once and never clobbers later
# operator edits. Runs on BOTH dev and prod (user_albums.user_id holds the
# fan/customer id — the loose FK — so we match on it directly).
backfill_task_1189_scrub_standard_autogrants() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1189 standard-autogrant scrub on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_total integer := 0;
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1189_scrub_standard_autogrants'
  ) THEN
    -- Dry-run breakdown FIRST (mandatory — this is destructive).
    FOR r IN
      SELECT ua.album_id, ua.certificate_number, count(*) AS n
      FROM user_albums ua
      WHERE ua.album_id IN ('album-1','album-2','album-3','album-4')
        AND ua.is_preview = false
        AND ua.certificate_number IN (12,7,3,21)
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_id = ua.user_id
            AND o.album_id   = ua.album_id
            AND o.status IN ('paid','shipped')
        )
      GROUP BY ua.album_id, ua.certificate_number
      ORDER BY ua.album_id, ua.certificate_number
    LOOP
      RAISE NOTICE 'task-1189 dry-run: album=% cert=% rows=%', r.album_id, r.certificate_number, r.n;
    END LOOP;

    DELETE FROM user_albums ua
    WHERE ua.album_id IN ('album-1','album-2','album-3','album-4')
      AND ua.is_preview = false
      AND ua.certificate_number IN (12,7,3,21)
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.customer_id = ua.user_id
          AND o.album_id   = ua.album_id
          AND o.status IN ('paid','shipped')
      );
    GET DIAGNOSTICS v_total = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_1189_scrub_standard_autogrants');

    RAISE NOTICE 'task-1189 standard-autogrant scrub applied: % rows removed', v_total;
  ELSE
    RAISE NOTICE 'task-1189 standard-autogrant scrub already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1189 standard-autogrant scrub ok on $label"
    echo "$out" | grep -i 'task-1189' || true
  else
    echo "post-merge: WARNING — task-1189 standard-autogrant scrub failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1189_scrub_standard_autogrants dev  "${DATABASE_URL:-}"
backfill_task_1189_scrub_standard_autogrants prod "${PROD_DATABASE_URL:-}"

# Task #1182 — Set the Nightbirde "Hope" album's full original release date so
# the desktop album footer's first line reads "June 8, 2026" instead of the
# bare-year fallback ("2026"). Nightbirde data is prod-only, so this targets
# the prod album row by its stable id (dev simply updates 0 rows).
#
# TRUE ONE-TIME backfill, NOT a per-merge reset: a marker row in
# `post_merge_data_backfills` gates it so a later operator edit (changing the
# release date in the CMS) is never clobbered on the next merge. We also only
# write when the date is currently NULL, so an existing operator value wins
# even before the marker lands. Guard + write share one transaction.
backfill_task_1182_nightbirde_release_date() {
  local label="$1"; local url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1182 nightbirde release-date backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
    WHERE name = 'task_1182_nightbirde_release_date'
  ) THEN
    UPDATE albums
       SET original_release_date = '2026-06-08'
     WHERE id = 'b250a5a5-98cc-4673-9903-ab39e5278d8c'
       AND original_release_date IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_1182_nightbirde_release_date');

    RAISE NOTICE 'task-1182 backfill applied: % album release date(s) set', v_count;
  ELSE
    RAISE NOTICE 'task-1182 backfill already applied — skipping (operator edits preserved)';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1182 nightbirde release-date backfill ok on $label"
    echo "$out" | grep -i 'task-1182' || true
  else
    echo "post-merge: WARNING — task-1182 nightbirde release-date backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1182_nightbirde_release_date dev  "${DATABASE_URL:-}"
backfill_task_1182_nightbirde_release_date prod "${PROD_DATABASE_URL:-}"

# Task #1229 — Seed Gruhn Guitars as a recognized reseller vendor row.
# guitars.com is registered in KNOWN_HOSTS (server/routes.ts) and the
# scraper resolves it as "Gruhn Guitars," but with no matching `vendors`
# row the first guitar scraped from guitars.com auto-creates a bare stub
# (32x32 favicon logo only, no bio, no cover). This seeds a proper row so
# the reseller chip looks polished immediately after the first import.
#
# The wordmark is Gruhn's own storefront header logo, mirrored ONCE into
# the shared dev+prod Object Storage bucket (see scripts/mirror-gruhn-
# logo.ts + .agents/memory/object-storage-shared-bucket.md), so the same
# /objects/uploads/<id> URL resolves in both environments.
#
# Idempotent: an INSERT … SELECT guarded by NOT EXISTS on the apex domain
# among top-level (parent_vendor_id IS NULL), non-deleted rows — so it
# never duplicates Gruhn, never resurrects a soft-deleted row, and never
# clobbers an operator's later edits (logo/bio/location curation wins).
# is_reseller=true / is_maker=false matches the KNOWN_HOSTS "reseller"
# role. Runs on BOTH dev and prod.
seed_task_1229_gruhn_vendor() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1229 gruhn-vendor seed on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
INSERT INTO vendors (name, domain, is_maker, is_reseller, home_url, about_url, logo_url, bio, location)
SELECT 'Gruhn Guitars',
       'guitars.com',
       false,
       true,
       'https://guitars.com/',
       'https://guitars.com/',
       '/objects/uploads/420c4a77-5888-4c68-a30c-7b6cb187174c.png',
       'Nashville''s premier vintage guitar dealer, founded in 1970',
       'Nashville, TN'
WHERE NOT EXISTS (
  SELECT 1 FROM vendors
  WHERE domain = 'guitars.com'
    AND parent_vendor_id IS NULL
    AND deleted_at IS NULL
);
SQL
  then
    echo "post-merge: task-1229 gruhn-vendor seed ok on $label"
  else
    echo "post-merge: WARNING — task-1229 gruhn-vendor seed failed on $label (continuing)"
  fi
}
seed_task_1229_gruhn_vendor dev  "${DATABASE_URL:-}"
seed_task_1229_gruhn_vendor prod "${PROD_DATABASE_URL:-}"

# Task #1252 — fix vendors_domain_top_uniq partial index to also exclude
# soft-deleted rows. The original index (WHERE parent_vendor_id IS NULL) did
# NOT filter on deleted_at, so a soft-deleted vendor permanently squatted its
# domain and re-creation blew up with an unhandled 23505 unique-violation.
# Drop the old index and recreate with the corrected predicate on BOTH dev and
# prod. Idempotent: DROP IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
migrate_vendors_domain_top_uniq() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping vendors_domain_top_uniq fix on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
-- Drop the old index that did not exclude soft-deleted rows.
DROP INDEX IF EXISTS vendors_domain_top_uniq;
-- Recreate with deleted_at IS NULL so trashing a vendor frees its domain slot.
CREATE UNIQUE INDEX IF NOT EXISTS vendors_domain_top_uniq
  ON vendors (domain)
  WHERE parent_vendor_id IS NULL AND deleted_at IS NULL;
COMMIT;
SQL
  then
    echo "post-merge: vendors_domain_top_uniq fix ok on $label"
  else
    echo "post-merge: WARNING — vendors_domain_top_uniq fix failed on $label (continuing)"
  fi
}
migrate_vendors_domain_top_uniq dev  "${DATABASE_URL:-}"
migrate_vendors_domain_top_uniq prod "${PROD_DATABASE_URL:-}"

# Task #1254 — audit follow-up to the vendors_domain_top_uniq fix (#1252).
# The same soft-delete/unique-index mismatch existed on every other
# soft-deletable entity carrying a natural-key unique: labels.domain,
# manufacturers.domain, fulfillment_partners.domain, and albums.share_slug.
# None of those partial indexes filtered on deleted_at, so trashing a
# label/press/fulfillment-partner/release permanently squatted its
# domain/slug and re-creation blew up with an unhandled 23505. Drop each
# old index and recreate with `... AND deleted_at IS NULL` on BOTH dev and
# prod. Idempotent: DROP IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
migrate_softdelete_natural_key_uniques() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping softdelete natural-key uniques fix on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
-- labels.domain — drop any prior form (constraint or partial index) then
-- recreate excluding soft-deleted rows.
ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_domain_unique;
ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_domain_key;
DROP INDEX IF EXISTS labels_domain_unique;
DROP INDEX IF EXISTS labels_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS labels_domain_unique
  ON labels (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- manufacturers.domain
ALTER TABLE manufacturers DROP CONSTRAINT IF EXISTS manufacturers_domain_unique;
ALTER TABLE manufacturers DROP CONSTRAINT IF EXISTS manufacturers_domain_key;
DROP INDEX IF EXISTS manufacturers_domain_unique;
DROP INDEX IF EXISTS manufacturers_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS manufacturers_domain_unique
  ON manufacturers (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- fulfillment_partners.domain
ALTER TABLE fulfillment_partners DROP CONSTRAINT IF EXISTS fulfillment_partners_domain_unique;
ALTER TABLE fulfillment_partners DROP CONSTRAINT IF EXISTS fulfillment_partners_domain_key;
DROP INDEX IF EXISTS fulfillment_partners_domain_unique;
DROP INDEX IF EXISTS fulfillment_partners_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_partners_domain_unique
  ON fulfillment_partners (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- albums.share_slug — the old global albums_share_slug_unique index had no
-- deleted_at filter, so a trashed release squatted its slug. Uniqueness is now
-- PER-ARTIST (composite albums_artist_share_slug_unique), created by
-- migrate_task_1310_share_slugs below; here we only drop any legacy global
-- index. Never recreate a global share_slug index: it can't build when a
-- soft-deleted release shares a live slug, and a transient create races the
-- publish dev->prod diff.
DROP INDEX IF EXISTS albums_share_slug_unique;
COMMIT;
SQL
  then
    echo "post-merge: softdelete natural-key uniques fix ok on $label"
  else
    echo "post-merge: WARNING — softdelete natural-key uniques fix failed on $label (continuing)"
  fi
}
migrate_softdelete_natural_key_uniques dev  "${DATABASE_URL:-}"
migrate_softdelete_natural_key_uniques prod "${PROD_DATABASE_URL:-}"

# Admin customer info — Stripe payment snapshot. orders gains 4 nullable
# text columns (card brand/last4, digital-wallet type, Stripe-hosted
# receipt URL) declared in shared/schema.ts. drizzle-kit push has been
# unreliable on additive DDL (see albums-schema-drift.md), so hand-apply
# on BOTH dev and prod to keep the publish dev->prod diff empty.
# Idempotent. All null for legacy/imported orders.
migrate_orders_payment_snapshot() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping orders payment-snapshot migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_card_brand text,
  ADD COLUMN IF NOT EXISTS payment_card_last4 text,
  ADD COLUMN IF NOT EXISTS payment_wallet_type text,
  ADD COLUMN IF NOT EXISTS receipt_url text;
SQL
  then
    echo "post-merge: orders payment-snapshot migration ok on $label"
  else
    echo "post-merge: WARNING — orders payment-snapshot migration failed on $label (continuing)"
  fi
}
migrate_orders_payment_snapshot dev  "${DATABASE_URL:-}"
migrate_orders_payment_snapshot prod "${PROD_DATABASE_URL:-}"

# ─── Task #1916 — Order Desk fulfillment error column + default partner ───────
# Adds orders.fulfillment_error so push failures surface to operators without
# opening server logs, and sets Spinney as the is_default fulfillment partner
# so routing is deterministic when both Spinney and PacPack rows exist.
migrate_task_1916_fulfillment_flow() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1916 fulfillment-flow migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_error text;
SQL
  then
    echo "post-merge: task-1916 fulfillment-flow migration ok on $label"
  else
    echo "post-merge: WARNING — task-1916 fulfillment-flow migration failed on $label (continuing)"
  fi
}
migrate_task_1916_fulfillment_flow dev  "${DATABASE_URL:-}"
migrate_task_1916_fulfillment_flow prod "${PROD_DATABASE_URL:-}"

# Set Spinney Media as the default fulfillment partner (is_default = true).
# Idempotent: only updates the known Spinney row; leaves PacPack alone.
# The is_default column was added above in the partner-address migration block.
backfill_task_1916_spinney_default() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1916 spinney-default backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1916_spinney_default'
  ) THEN
    -- Mark Spinney Media as the platform default; all other partners get false.
    UPDATE fulfillment_partners
       SET is_default = (id = '389bd449-b548-4fee-8e3a-4a5be9191a6a')
     WHERE deleted_at IS NULL;
    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1916_spinney_default');
    RAISE NOTICE 'task_1916_spinney_default applied';
  ELSE
    RAISE NOTICE 'task_1916_spinney_default already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1916 spinney-default backfill ok on $label"
    echo "$out" | grep -i 'task_1916' || true
  else
    echo "post-merge: WARNING — task-1916 spinney-default backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1916_spinney_default dev  "${DATABASE_URL:-}"
backfill_task_1916_spinney_default prod "${PROD_DATABASE_URL:-}"

# ─── Task #1310 — Two-part artist/album share links ──────────────────────────
# Adds people.artist_share_slug (globally-unique per non-trashed person) and
# changes albums' share-slug uniqueness from global to per-artist composite.
# Both sides are idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT
# EXISTS + DROP INDEX IF EXISTS. The old global albums_share_slug_unique index
# is dropped (no data loss — albums.share_slug values are untouched) and
# replaced with the per-artist composite.
migrate_task_1310_share_slugs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1310 share-slug migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
-- Artist share slug column on people
ALTER TABLE people ADD COLUMN IF NOT EXISTS artist_share_slug text;
-- Partial unique index: globally unique among non-trashed people
CREATE UNIQUE INDEX IF NOT EXISTS people_artist_share_slug_unique
  ON people (artist_share_slug)
  WHERE artist_share_slug IS NOT NULL AND deleted_at IS NULL;
-- Drop the old global albums share-slug unique index (no data loss)
DROP INDEX IF EXISTS albums_share_slug_unique;
-- Per-artist composite index: unique within each artist's catalog
CREATE UNIQUE INDEX IF NOT EXISTS albums_artist_share_slug_unique
  ON albums (primary_artist_id, share_slug)
  WHERE primary_artist_id IS NOT NULL
    AND share_slug IS NOT NULL
    AND deleted_at IS NULL;
SQL
  then
    echo "post-merge: task-1310 share-slug migration ok on $label"
  else
    echo "post-merge: WARNING — task-1310 share-slug migration failed on $label (continuing)"
  fi
}
migrate_task_1310_share_slugs dev  "${DATABASE_URL:-}"
migrate_task_1310_share_slugs prod "${PROD_DATABASE_URL:-}"

# Task #1319 — Enter Nightbirde's 'Still Got Dreams' credits onto the
# Hope + Love 7" Duos. Creates People records for the production/creative
# team, inserts album-wide credits on both the Hope Duo
# (b250a5a5-98cc-4673-9903-ab39e5278d8c) and Love Duo
# (373ab2b4-9c24-448b-837f-66903bbb81aa), and attaches per-song
# songwriter/performer credits to the specific tracks called out in the
# credit document. Jane Marczewski reuses her existing "Nightbirde" Person
# record (3ca615d6-7c04-422f-8dab-3f89607e648e). All inserts are guarded by
# NOT EXISTS on (album_id/song_id, name, role, deleted_at IS NULL) so
# re-runs are safe and later admin edits won't be overwritten.
backfill_task_1319_nightbirde_credits() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1319 nightbirde credits backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_jane_id    text := '3ca615d6-7c04-422f-8dab-3f89607e648e';
  v_geoff_id   text;
  v_amber_id   text;
  v_rice_id    text;
  v_dan_id     text;
  v_nika_id    text;
  v_aaron_id   text;
  v_jennifer_id text;
  v_sidumo_id  text;
  v_abbey_id   text;
  v_katelyn_id text;
  v_konata_id  text;
  v_hope_id    text := 'b250a5a5-98cc-4673-9903-ab39e5278d8c';
  v_love_id    text := '373ab2b4-9c24-448b-837f-66903bbb81aa';
  v_empire_id  text := 'c65d351d-270c-400d-8e9e-1471ca9cf340';
  v_haisy_id   text := '4a0fb064-1afa-4214-91b0-ea5ddb01b72f';
  v_laisy_id   text := '4fdf33f8-69f5-4abf-b8af-075eb153cab7';
  v_sgd_id     text := 'eb1af405-a7f5-43d8-8e63-8a86dcd578d8';
  v_pos        integer;
  r            record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1319_nightbirde_credits'
  ) THEN

    -- ── Step 1: People (match on name; insert if not already present) ──────
    SELECT id INTO v_geoff_id   FROM people WHERE name = 'Geoff Duncan'               AND deleted_at IS NULL LIMIT 1;
    IF v_geoff_id   IS NULL THEN v_geoff_id   := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_geoff_id,   'Geoff Duncan');               END IF;

    SELECT id INTO v_amber_id   FROM people WHERE name = 'Amber Stoneman'             AND deleted_at IS NULL LIMIT 1;
    IF v_amber_id   IS NULL THEN v_amber_id   := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_amber_id,   'Amber Stoneman');             END IF;

    SELECT id INTO v_rice_id    FROM people WHERE name = 'Nicholas "Rice" Daniels'    AND deleted_at IS NULL LIMIT 1;
    IF v_rice_id    IS NULL THEN v_rice_id    := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_rice_id,    'Nicholas "Rice" Daniels');    END IF;

    SELECT id INTO v_dan_id     FROM people WHERE name = 'Dan Shike'                  AND deleted_at IS NULL LIMIT 1;
    IF v_dan_id     IS NULL THEN v_dan_id     := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_dan_id,     'Dan Shike');                  END IF;

    SELECT id INTO v_nika_id    FROM people WHERE name = 'Nika Duncan'                AND deleted_at IS NULL LIMIT 1;
    IF v_nika_id    IS NULL THEN v_nika_id    := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_nika_id,    'Nika Duncan');                END IF;

    SELECT id INTO v_aaron_id   FROM people WHERE name = 'Aaron Wagner'               AND deleted_at IS NULL LIMIT 1;
    IF v_aaron_id   IS NULL THEN v_aaron_id   := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_aaron_id,   'Aaron Wagner');               END IF;

    SELECT id INTO v_jennifer_id FROM people WHERE name = 'Jennifer Wagner'           AND deleted_at IS NULL LIMIT 1;
    IF v_jennifer_id IS NULL THEN v_jennifer_id := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_jennifer_id, 'Jennifer Wagner');           END IF;

    SELECT id INTO v_sidumo_id  FROM people WHERE name = 'Sidumo Nyamezele'           AND deleted_at IS NULL LIMIT 1;
    IF v_sidumo_id  IS NULL THEN v_sidumo_id  := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_sidumo_id,  'Sidumo Nyamezele');           END IF;

    SELECT id INTO v_abbey_id   FROM people WHERE name = 'Abbey James'                AND deleted_at IS NULL LIMIT 1;
    IF v_abbey_id   IS NULL THEN v_abbey_id   := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_abbey_id,   'Abbey James');                END IF;

    SELECT id INTO v_katelyn_id FROM people WHERE name = 'Katelyn Marczewski'         AND deleted_at IS NULL LIMIT 1;
    IF v_katelyn_id IS NULL THEN v_katelyn_id := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_katelyn_id, 'Katelyn Marczewski');         END IF;

    SELECT id INTO v_konata_id  FROM people WHERE name = 'Konata Small'               AND deleted_at IS NULL LIMIT 1;
    IF v_konata_id  IS NULL THEN v_konata_id  := gen_random_uuid()::text;
      INSERT INTO people (id, name) VALUES (v_konata_id,  'Konata Small');               END IF;

    -- ── Step 2: Album-wide credits on BOTH Hope Duo + Love Duo ─────────────
    FOR r IN (SELECT id AS aid FROM albums WHERE id IN (v_hope_id, v_love_id) AND deleted_at IS NULL) LOOP
      v_pos := 0;

      -- Production
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_geoff_id, 'Geoff Duncan', 'Lead Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Geoff Duncan' AND role = 'Lead Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_geoff_id, 'Geoff Duncan', 'Engineer, Recording & Post Production', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Geoff Duncan' AND role = 'Engineer, Recording & Post Production' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_amber_id, 'Amber Stoneman', 'Associate Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Amber Stoneman' AND role = 'Associate Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_rice_id, 'Nicholas "Rice" Daniels', 'Assistant Associate Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nicholas "Rice" Daniels' AND role = 'Assistant Associate Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_dan_id, 'Dan Shike', 'Mastering Engineer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Dan Shike' AND role = 'Mastering Engineer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Additional Recording & Engineering
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_nika_id, 'Nika Duncan', 'Background Vocals', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nika Duncan' AND role = 'Background Vocals' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Art & Creative Direction
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_amber_id, 'Amber Stoneman', 'Creative Director; Album Art & Music Direction', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Amber Stoneman' AND role = 'Creative Director; Album Art & Music Direction' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_rice_id, 'Nicholas "Rice" Daniels', 'Assistant Creative Director', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nicholas "Rice" Daniels' AND role = 'Assistant Creative Director' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_abbey_id, 'Abbey James', E'Album Art\'s Original Photos', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Abbey James' AND role = E'Album Art\'s Original Photos' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_amber_id, 'Amber Stoneman', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Amber Stoneman' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_rice_id, 'Nicholas "Rice" Daniels', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nicholas "Rice" Daniels' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_katelyn_id, 'Katelyn Marczewski', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Katelyn Marczewski' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Administration
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, v_rice_id, 'Nicholas "Rice" Daniels', 'Album Administrator', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nicholas "Rice" Daniels' AND role = 'Album Administrator' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Non-person entities (person_id intentionally NULL)
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, NULL, 'Nightbirde LLC', 'Record Label', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Nightbirde LLC' AND role = 'Record Label' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, NULL, 'Jane Marczewski Publishing', 'Publishing', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'Jane Marczewski Publishing' AND role = 'Publishing' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT r.aid, NULL, 'The Nightbirde Foundation & The Marczewski Family', 'Honorable Mentions', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = r.aid AND name = 'The Nightbirde Foundation & The Marczewski Family' AND role = 'Honorable Mentions' AND deleted_at IS NULL);
    END LOOP;

    -- ── Step 3: Songwriter credit for Jane (Nightbirde) on ALL songs ────────
    -- Applies to every non-deleted song on both Duos. Idempotent via
    -- NOT EXISTS on (song_id, name, role, deleted_at IS NULL).
    FOR r IN (
      SELECT s.id AS sid
      FROM songs s
      WHERE s.album_id IN (v_hope_id, v_love_id)
        AND s.deleted_at IS NULL
    ) LOOP
      INSERT INTO track_writers (song_id, person_id, name, role, position)
        SELECT r.sid, v_jane_id, 'Nightbirde', 'Songwriter', 0
        WHERE NOT EXISTS (
          SELECT 1 FROM track_writers
          WHERE song_id = r.sid AND name = 'Nightbirde' AND role = 'Songwriter' AND deleted_at IS NULL
        );
    END LOOP;

    -- ── Step 4: Song-specific credits ──────────────────────────────────────

    -- "Empire" (Hope Duo): Konata Small — Songwriter
    INSERT INTO track_writers (song_id, person_id, name, role, position)
      SELECT v_empire_id, v_konata_id, 'Konata Small', 'Songwriter', 1
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_empire_id)
        AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = v_empire_id AND name = 'Konata Small' AND role = 'Songwriter' AND deleted_at IS NULL);

    -- "All I See Is You" (Hope Duo): Aaron Wagner + Jennifer Wagner — Songwriter
    INSERT INTO track_writers (song_id, person_id, name, role, position)
      SELECT v_haisy_id, v_aaron_id, 'Aaron Wagner', 'Songwriter', 1
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_haisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = v_haisy_id AND name = 'Aaron Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

    INSERT INTO track_writers (song_id, person_id, name, role, position)
      SELECT v_haisy_id, v_jennifer_id, 'Jennifer Wagner', 'Songwriter', 2
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_haisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = v_haisy_id AND name = 'Jennifer Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

    -- "All I See Is You" (Hope Duo): Aaron Wagner — Additional Production & Engineering
    INSERT INTO track_performers (song_id, person_id, name, role, position)
      SELECT v_haisy_id, v_aaron_id, 'Aaron Wagner', 'Additional Production & Engineering', 0
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_haisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_performers WHERE song_id = v_haisy_id AND name = 'Aaron Wagner' AND role = 'Additional Production & Engineering' AND deleted_at IS NULL);

    -- "All I See Is You" (Love Duo): Aaron Wagner + Jennifer Wagner — Songwriter
    INSERT INTO track_writers (song_id, person_id, name, role, position)
      SELECT v_laisy_id, v_aaron_id, 'Aaron Wagner', 'Songwriter', 1
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_laisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = v_laisy_id AND name = 'Aaron Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

    INSERT INTO track_writers (song_id, person_id, name, role, position)
      SELECT v_laisy_id, v_jennifer_id, 'Jennifer Wagner', 'Songwriter', 2
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_laisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = v_laisy_id AND name = 'Jennifer Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

    -- "All I See Is You" (Love Duo): Aaron Wagner — Additional Production & Engineering
    INSERT INTO track_performers (song_id, person_id, name, role, position)
      SELECT v_laisy_id, v_aaron_id, 'Aaron Wagner', 'Additional Production & Engineering', 0
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_laisy_id)
        AND NOT EXISTS (SELECT 1 FROM track_performers WHERE song_id = v_laisy_id AND name = 'Aaron Wagner' AND role = 'Additional Production & Engineering' AND deleted_at IS NULL);

    -- "Still Got Dreams" (Hope Duo): Sidumo Nyamezele — Choir Director
    INSERT INTO track_performers (song_id, person_id, name, role, position)
      SELECT v_sgd_id, v_sidumo_id, 'Sidumo Nyamezele', 'Choir Director', 0
      WHERE EXISTS (SELECT 1 FROM songs WHERE id = v_sgd_id)
        AND NOT EXISTS (SELECT 1 FROM track_performers WHERE song_id = v_sgd_id AND name = 'Sidumo Nyamezele' AND role = 'Choir Director' AND deleted_at IS NULL);

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1319_nightbirde_credits');
    RAISE NOTICE 'task-1319 backfill applied: Nightbirde credits for Hope + Love 7" Duos';
  ELSE
    RAISE NOTICE 'task-1319 backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1319 nightbirde credits backfill ok on $label"
    echo "$out" | grep -i 'task-1319' || true
  else
    echo "post-merge: WARNING — task-1319 nightbirde credits backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1319_nightbirde_credits dev  "${DATABASE_URL:-}"
backfill_task_1319_nightbirde_credits prod "${PROD_DATABASE_URL:-}"

# ──────────────────────────────────────────────────────────────────────────
# Task #1320 — Apply the same Still Got Dreams credits to the Brave 7" Duo
# (4eb162f7-54c3-4083-83e4-3ff07dde5370) once Amber uploads its tracks.
#
# The Brave Duo was intentionally excluded from Task #1319 because its audio
# tracks weren't uploaded yet. This mirrors the album-wide credits onto Brave,
# adds Jane (Nightbirde)'s Songwriter credit to every Brave track, and lands
# the per-song credits on the matching Brave songs (Empire → Konata Small;
# All I See Is You → Aaron + Jennifer Wagner; Still Got Dreams → Sidumo
# Nyamezele), matching the tracklist by case-insensitive title.
#
# Critically, the whole backfill is GATED on Brave actually having tracks: if
# the album has zero songs the function defers WITHOUT writing the marker, so
# it re-runs on the next merge until Amber's tracks land — otherwise the marker
# would be stamped prematurely and the per-track credits would never apply. The
# 11 People records already exist from Task #1319 and are matched by name (not
# re-inserted). All inserts are NOT EXISTS-guarded so re-runs are safe and admin
# edits won't be overwritten.
backfill_task_1319_brave_credits() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1320 brave credits backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_jane_id     text := '3ca615d6-7c04-422f-8dab-3f89607e648e';
  v_geoff_id    text;
  v_amber_id    text;
  v_rice_id     text;
  v_dan_id      text;
  v_nika_id     text;
  v_aaron_id    text;
  v_jennifer_id text;
  v_sidumo_id   text;
  v_abbey_id    text;
  v_katelyn_id  text;
  v_konata_id   text;
  v_brave_id    text := '4eb162f7-54c3-4083-83e4-3ff07dde5370';
  v_song_count  integer;
  v_pos         integer;
  r             record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1319_brave_credits'
  ) THEN

    -- Gate: only proceed once the Brave Duo exists AND its tracks are uploaded.
    SELECT count(*) INTO v_song_count
      FROM songs s
      WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL;

    IF EXISTS (SELECT 1 FROM albums WHERE id = v_brave_id AND deleted_at IS NULL)
       AND v_song_count > 0 THEN

      -- ── Step 1: People (match on name; insert only if missing) ────────────
      SELECT id INTO v_geoff_id    FROM people WHERE name = 'Geoff Duncan'            AND deleted_at IS NULL LIMIT 1;
      IF v_geoff_id    IS NULL THEN v_geoff_id    := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_geoff_id,    'Geoff Duncan');            END IF;

      SELECT id INTO v_amber_id    FROM people WHERE name = 'Amber Stoneman'          AND deleted_at IS NULL LIMIT 1;
      IF v_amber_id    IS NULL THEN v_amber_id    := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_amber_id,    'Amber Stoneman');          END IF;

      SELECT id INTO v_rice_id     FROM people WHERE name = 'Nicholas "Rice" Daniels' AND deleted_at IS NULL LIMIT 1;
      IF v_rice_id     IS NULL THEN v_rice_id     := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_rice_id,     'Nicholas "Rice" Daniels'); END IF;

      SELECT id INTO v_dan_id      FROM people WHERE name = 'Dan Shike'               AND deleted_at IS NULL LIMIT 1;
      IF v_dan_id      IS NULL THEN v_dan_id      := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_dan_id,      'Dan Shike');               END IF;

      SELECT id INTO v_nika_id     FROM people WHERE name = 'Nika Duncan'             AND deleted_at IS NULL LIMIT 1;
      IF v_nika_id     IS NULL THEN v_nika_id     := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_nika_id,     'Nika Duncan');             END IF;

      SELECT id INTO v_aaron_id    FROM people WHERE name = 'Aaron Wagner'            AND deleted_at IS NULL LIMIT 1;
      IF v_aaron_id    IS NULL THEN v_aaron_id    := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_aaron_id,    'Aaron Wagner');            END IF;

      SELECT id INTO v_jennifer_id FROM people WHERE name = 'Jennifer Wagner'         AND deleted_at IS NULL LIMIT 1;
      IF v_jennifer_id IS NULL THEN v_jennifer_id := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_jennifer_id, 'Jennifer Wagner');         END IF;

      SELECT id INTO v_sidumo_id   FROM people WHERE name = 'Sidumo Nyamezele'        AND deleted_at IS NULL LIMIT 1;
      IF v_sidumo_id   IS NULL THEN v_sidumo_id   := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_sidumo_id,   'Sidumo Nyamezele');        END IF;

      SELECT id INTO v_abbey_id    FROM people WHERE name = 'Abbey James'             AND deleted_at IS NULL LIMIT 1;
      IF v_abbey_id    IS NULL THEN v_abbey_id    := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_abbey_id,    'Abbey James');             END IF;

      SELECT id INTO v_katelyn_id  FROM people WHERE name = 'Katelyn Marczewski'      AND deleted_at IS NULL LIMIT 1;
      IF v_katelyn_id  IS NULL THEN v_katelyn_id  := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_katelyn_id,  'Katelyn Marczewski');      END IF;

      SELECT id INTO v_konata_id   FROM people WHERE name = 'Konata Small'            AND deleted_at IS NULL LIMIT 1;
      IF v_konata_id   IS NULL THEN v_konata_id   := gen_random_uuid()::text;
        INSERT INTO people (id, name) VALUES (v_konata_id,   'Konata Small');            END IF;

      -- ── Step 2: Album-wide credits on the Brave Duo ───────────────────────
      v_pos := 0;

      -- Production
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_geoff_id, 'Geoff Duncan', 'Lead Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Geoff Duncan' AND role = 'Lead Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_geoff_id, 'Geoff Duncan', 'Engineer, Recording & Post Production', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Geoff Duncan' AND role = 'Engineer, Recording & Post Production' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_amber_id, 'Amber Stoneman', 'Associate Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Amber Stoneman' AND role = 'Associate Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_rice_id, 'Nicholas "Rice" Daniels', 'Assistant Associate Producer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nicholas "Rice" Daniels' AND role = 'Assistant Associate Producer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_dan_id, 'Dan Shike', 'Mastering Engineer', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Dan Shike' AND role = 'Mastering Engineer' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Additional Recording & Engineering
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_nika_id, 'Nika Duncan', 'Background Vocals', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nika Duncan' AND role = 'Background Vocals' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Art & Creative Direction
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_amber_id, 'Amber Stoneman', 'Creative Director; Album Art & Music Direction', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Amber Stoneman' AND role = 'Creative Director; Album Art & Music Direction' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_rice_id, 'Nicholas "Rice" Daniels', 'Assistant Creative Director', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nicholas "Rice" Daniels' AND role = 'Assistant Creative Director' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_abbey_id, 'Abbey James', E'Album Art\'s Original Photos', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Abbey James' AND role = E'Album Art\'s Original Photos' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_amber_id, 'Amber Stoneman', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Amber Stoneman' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_rice_id, 'Nicholas "Rice" Daniels', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nicholas "Rice" Daniels' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_katelyn_id, 'Katelyn Marczewski', 'Album Merchandise Creative Direction & Design', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Katelyn Marczewski' AND role = 'Album Merchandise Creative Direction & Design' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Administration
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, v_rice_id, 'Nicholas "Rice" Daniels', 'Album Administrator', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nicholas "Rice" Daniels' AND role = 'Album Administrator' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      -- Non-person entities (person_id intentionally NULL)
      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, NULL, 'Nightbirde LLC', 'Record Label', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Nightbirde LLC' AND role = 'Record Label' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, NULL, 'Jane Marczewski Publishing', 'Publishing', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'Jane Marczewski Publishing' AND role = 'Publishing' AND deleted_at IS NULL);
      v_pos := v_pos + 1;

      INSERT INTO album_credits (album_id, person_id, name, role, position)
        SELECT v_brave_id, NULL, 'The Nightbirde Foundation & The Marczewski Family', 'Honorable Mentions', v_pos
        WHERE NOT EXISTS (SELECT 1 FROM album_credits WHERE album_id = v_brave_id AND name = 'The Nightbirde Foundation & The Marczewski Family' AND role = 'Honorable Mentions' AND deleted_at IS NULL);

      -- ── Step 3: Songwriter credit for Jane (Nightbirde) on ALL Brave songs ─
      FOR r IN (
        SELECT s.id AS sid
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
      ) LOOP
        INSERT INTO track_writers (song_id, person_id, name, role, position)
          SELECT r.sid, v_jane_id, 'Nightbirde', 'Songwriter', 0
          WHERE NOT EXISTS (
            SELECT 1 FROM track_writers
            WHERE song_id = r.sid AND name = 'Nightbirde' AND role = 'Songwriter' AND deleted_at IS NULL
          );
      END LOOP;

      -- ── Step 4: Song-specific credits (matched by case-insensitive title) ──

      -- "Empire": Konata Small — Songwriter
      INSERT INTO track_writers (song_id, person_id, name, role, position)
        SELECT s.id, v_konata_id, 'Konata Small', 'Songwriter', 1
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
          AND lower(btrim(s.title)) = 'empire'
          AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = s.id AND name = 'Konata Small' AND role = 'Songwriter' AND deleted_at IS NULL);

      -- "All I See Is You": Aaron Wagner + Jennifer Wagner — Songwriter
      INSERT INTO track_writers (song_id, person_id, name, role, position)
        SELECT s.id, v_aaron_id, 'Aaron Wagner', 'Songwriter', 1
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
          AND lower(btrim(s.title)) = 'all i see is you'
          AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = s.id AND name = 'Aaron Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

      INSERT INTO track_writers (song_id, person_id, name, role, position)
        SELECT s.id, v_jennifer_id, 'Jennifer Wagner', 'Songwriter', 2
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
          AND lower(btrim(s.title)) = 'all i see is you'
          AND NOT EXISTS (SELECT 1 FROM track_writers WHERE song_id = s.id AND name = 'Jennifer Wagner' AND role = 'Songwriter' AND deleted_at IS NULL);

      -- "All I See Is You": Aaron Wagner — Additional Production & Engineering
      INSERT INTO track_performers (song_id, person_id, name, role, position)
        SELECT s.id, v_aaron_id, 'Aaron Wagner', 'Additional Production & Engineering', 0
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
          AND lower(btrim(s.title)) = 'all i see is you'
          AND NOT EXISTS (SELECT 1 FROM track_performers WHERE song_id = s.id AND name = 'Aaron Wagner' AND role = 'Additional Production & Engineering' AND deleted_at IS NULL);

      -- "Still Got Dreams": Sidumo Nyamezele — Choir Director
      INSERT INTO track_performers (song_id, person_id, name, role, position)
        SELECT s.id, v_sidumo_id, 'Sidumo Nyamezele', 'Choir Director', 0
        FROM songs s
        WHERE s.album_id = v_brave_id AND s.deleted_at IS NULL
          AND lower(btrim(s.title)) = 'still got dreams'
          AND NOT EXISTS (SELECT 1 FROM track_performers WHERE song_id = s.id AND name = 'Sidumo Nyamezele' AND role = 'Choir Director' AND deleted_at IS NULL);

      INSERT INTO post_merge_data_backfills (name) VALUES ('task_1319_brave_credits');
      RAISE NOTICE 'task-1320 backfill applied: Nightbirde credits for Brave 7" Duo (% tracks)', v_song_count;
    ELSE
      RAISE NOTICE 'task-1320 backfill deferred: Brave 7" Duo has no uploaded tracks yet — will retry next merge';
    END IF;
  ELSE
    RAISE NOTICE 'task-1320 backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1320 brave credits backfill ok on $label"
    echo "$out" | grep -i 'task-1320' || true
  else
    echo "post-merge: WARNING — task-1320 brave credits backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1319_brave_credits dev  "${DATABASE_URL:-}"
backfill_task_1319_brave_credits prod "${PROD_DATABASE_URL:-}"

# Task #1329 — Stamp SPIN Promo cohort lifecycle dates (sunrise + sunset).
# Every SPIN Promo album (is_spin_promo=true, not soft-deleted) except
# Crashing Dream (Deluxe) gets:
#   good_tunes_release_date = '2024-08-28'  (sunrise — consistent window open)
#   streaming_release_date  = GREATEST('2024-09-28', last paid-order date)
# For albums with no paid orders the sunset lands on 9/28/24; for the ~10
# that kept selling it lands on their real last-sale date. Idempotent: re-run
# on a DB that already has the marker is a no-op.
backfill_task_1329_spin_dates() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1329 SPIN dates on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
  v_crashing_dream constant text := '9c4273fc-43ac-4441-a013-b6f2ee0cf8ad';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1329_spin_lifecycle_dates'
  ) THEN
    -- Compute per-album last paid-order date and stamp both lifecycle columns.
    -- Cohort = SPIN Promo, active, excluding Crashing Dream (Deluxe).
    WITH last_sale AS (
      SELECT
        o.album_id,
        TO_CHAR(MAX(o.created_at), 'YYYY-MM-DD') AS last_sale_date
      FROM orders o
      WHERE o.status IN ('paid', 'shipped', 'complete', 'completed')
      GROUP BY o.album_id
    )
    UPDATE albums a
    SET
      good_tunes_release_date = '2024-08-28',
      streaming_release_date  = GREATEST(
        '2024-09-28',
        COALESCE(ls.last_sale_date, '2024-09-28')
      )
    FROM last_sale ls
    RIGHT JOIN (
      SELECT id FROM albums
      WHERE is_spin_promo = true
        AND deleted_at IS NULL
        AND id <> v_crashing_dream
    ) cohort ON cohort.id = ls.album_id
    WHERE a.id = cohort.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1329_spin_lifecycle_dates');
    RAISE NOTICE 'task-1329 SPIN dates backfill applied: % albums updated', v_count;
  ELSE
    RAISE NOTICE 'task-1329 SPIN dates backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1329 SPIN dates backfill ok on $label"
    echo "$out" | grep -i 'task-1329' || true
  else
    echo "post-merge: WARNING — task-1329 SPIN dates backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1329_spin_dates dev  "${DATABASE_URL:-}"
backfill_task_1329_spin_dates prod "${PROD_DATABASE_URL:-}"

# Task #1329 — Stamp Nick Carter catalog sunset dates.
# Every Nick Carter album (primary_artist_id = known UUID, active) that has
# at least one paid order gets streaming_release_date = its last paid-order
# date. Albums with zero paid orders are left untouched (Love Life Tragedy
# already has a hand-set date of 2025-05-15). good_tunes_release_date is
# never touched — those are real release dates.
backfill_task_1329_nick_dates() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1329 Nick dates on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
  v_nick constant text := '7675d47c-a04b-4936-992e-eeb29c77f645';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1329_nick_lifecycle_dates'
  ) THEN
    -- Set each Nick album's sunset to its last paid-order date.
    -- Albums with zero paid orders are excluded (INNER JOIN) — their existing
    -- streaming_release_date (or null) is preserved unchanged.
    WITH last_sale AS (
      SELECT
        o.album_id,
        TO_CHAR(MAX(o.created_at), 'YYYY-MM-DD') AS last_sale_date
      FROM orders o
      WHERE o.status IN ('paid', 'shipped', 'complete', 'completed')
      GROUP BY o.album_id
    )
    UPDATE albums a
    SET streaming_release_date = ls.last_sale_date
    FROM last_sale ls
    WHERE a.id = ls.album_id
      AND a.primary_artist_id = v_nick
      AND a.deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1329_nick_lifecycle_dates');
    RAISE NOTICE 'task-1329 Nick dates backfill applied: % albums updated', v_count;
  ELSE
    RAISE NOTICE 'task-1329 Nick dates backfill already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1329 Nick dates backfill ok on $label"
    echo "$out" | grep -i 'task-1329' || true
  else
    echo "post-merge: WARNING — task-1329 Nick dates backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1329_nick_dates dev  "${DATABASE_URL:-}"
backfill_task_1329_nick_dates prod "${PROD_DATABASE_URL:-}"

# Task #1459 — Soft-delete the legacy sourceless bonus-video placeholder
# rows. A historical seed minted ~35 album_videos rows (Nick Carter's LLT
# single series + Aliza Hava's "Into the Light") with a title but NO media:
# empty video_url, null source_url, no Mux asset/playback id. The Mux
# pipeline correctly skips them (nothing to ingest) and the fan/admin
# surfaces show an honest "unavailable" / "No source file" state — but
# they're still broken tiles. Bill's call (Task #1459) is to remove the
# empty slots; he'll re-upload the real footage later as fresh rows. No
# Dropbox/source URL was ever stored on these rows, so an automated
# reimport isn't possible.
#
# This flips the soft-delete trio (same effect as an admin Delete) so the
# rows drop out of every list/detail read (all filter deleted_at IS NULL)
# and land on /admin/trash for the 30-day window before the sweeper purges
# them. The WHERE clause is self-limiting — it can only ever match a row
# with NO playable source, never a `ready` row (which carries video_url +
# asset + playback id). Marker-guarded so a row Bill later restores from
# trash (to attach footage) isn't re-deleted on the next merge. The data
# is prod-only (dev clones carry zero album_videos), so dev is a clean
# no-op. Idempotent.
backfill_task_1459_sourceless_videos() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1459 sourceless-video cleanup on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1459_sourceless_videos'
  ) THEN
    UPDATE album_videos
       SET deleted_at = now()
     WHERE deleted_at IS NULL
       AND (video_url IS NULL OR btrim(video_url) = '')
       AND source_url IS NULL
       AND mux_asset_id IS NULL
       AND mux_playback_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1459_sourceless_videos');
    RAISE NOTICE 'task-1459 sourceless-video cleanup applied: % rows soft-deleted', v_count;
  ELSE
    RAISE NOTICE 'task-1459 sourceless-video cleanup already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1459 sourceless-video cleanup ok on $label"
    echo "$out" | grep -i 'task-1459' || true
  else
    echo "post-merge: WARNING — task-1459 sourceless-video cleanup failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1459_sourceless_videos dev  "${DATABASE_URL:-}"
backfill_task_1459_sourceless_videos prod "${PROD_DATABASE_URL:-}"

# Task #1643 — Rig tables (rigs, rig_accessories, track_rigs). A "Rig" is a
# named gear bundle (base instrument + accessory lines) attachable to a track
# with a per-track tweak note. New tables only — purely additive, idempotent,
# safe to run on every merge / on DBs that already have them. Applied to both
# dev and prod so the schema-drift guard (which diffs schema.ts → both DBs)
# stays green the moment the schema lands.
migrate_task_1643_rigs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1643 rig tables on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS rigs (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  instrument_id         varchar REFERENCES instruments(id) ON DELETE SET NULL,
  notes                 text,
  deleted_at            timestamp,
  deleted_by_user_id    varchar,
  deleted_via_parent_id varchar
);
CREATE TABLE IF NOT EXISTS rig_accessories (
  id        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  rig_id    varchar NOT NULL REFERENCES rigs(id) ON DELETE CASCADE,
  type      text NOT NULL,
  value     text NOT NULL,
  position  integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS track_rigs (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id               varchar NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  rig_id                varchar REFERENCES rigs(id) ON DELETE SET NULL,
  rig_name              text NOT NULL,
  tweak_note            text,
  position              integer NOT NULL DEFAULT 0,
  deleted_at            timestamp,
  deleted_by_user_id    varchar,
  deleted_via_parent_id varchar
);
CREATE INDEX IF NOT EXISTS rig_accessories_rig_id_idx ON rig_accessories(rig_id);
CREATE INDEX IF NOT EXISTS track_rigs_song_id_idx ON track_rigs(song_id);
COMMIT;
SQL
  then
    echo "post-merge: task-1643 rig tables ok on $label"
  else
    echo "post-merge: WARNING — task-1643 rig tables failed on $label (continuing)"
  fi
}
migrate_task_1643_rigs dev  "${DATABASE_URL:-}"
migrate_task_1643_rigs prod "${PROD_DATABASE_URL:-}"

# Task #1643 — Seed a demo Rig for Fernando Perdomo. Marker-guarded via
# post_merge_data_backfills so it runs exactly once per DB and never clobbers
# an operator edit. Fernando is prod-only data, so this no-ops (without
# stamping the marker) on the throwaway task/dev DBs and only lands the demo
# where his catalog actually exists. Idempotent + best-effort: a failure here
# never blocks a merge.
seed_task_1643_demo_rig() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1643 demo rig on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
DO $$
DECLARE
  v_person varchar;
  v_song   varchar;
  v_instr  varchar;
  v_rig    varchar;
BEGIN
  IF EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1643_demo_rig') THEN
    RAISE NOTICE 'task-1643 demo rig already applied — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_person
  FROM people
  WHERE name ILIKE 'Fernando Perdomo' AND deleted_at IS NULL
  ORDER BY id LIMIT 1;
  IF v_person IS NULL THEN
    RAISE NOTICE 'task-1643 demo rig: Fernando Perdomo not in this DB — skipping (prod-only demo)';
    RETURN;
  END IF;

  -- Pick a track he performs on, deterministically (nicest title first).
  SELECT tp.song_id INTO v_song
  FROM track_performers tp
  JOIN songs s ON s.id = tp.song_id
  WHERE tp.person_id = v_person AND tp.deleted_at IS NULL
  ORDER BY s.title, tp.song_id
  LIMIT 1;
  IF v_song IS NULL THEN
    RAISE NOTICE 'task-1643 demo rig: no Fernando track found — skipping';
    RETURN;
  END IF;

  -- Base instrument: prefer the 1973 Martin D-28 (matches the gear redesign
  -- mockup), else fall back to any guitar.
  SELECT id INTO v_instr FROM instruments WHERE id = 'i-martin-1973-d28';
  IF v_instr IS NULL THEN
    SELECT id INTO v_instr
    FROM instruments
    WHERE short_category = 'Guitar' AND deleted_at IS NULL
    ORDER BY id LIMIT 1;
  END IF;

  INSERT INTO rigs (name, instrument_id, notes)
  VALUES (
    'Fernando''s Folk-Pop Rig',
    v_instr,
    'Fernando''s go-to acoustic setup on Waves — warm fingerstyle tone.'
  )
  RETURNING id INTO v_rig;

  INSERT INTO rig_accessories (rig_id, type, value, position) VALUES
    (v_rig, 'Strings', 'D''Addario EJ16 Phosphor Bronze (.012–.053)', 0),
    (v_rig, 'Pick',    'Dunlop Tortex .60mm', 1),
    (v_rig, 'Capo',    'Shubb C1', 2),
    (v_rig, 'Tuning',  'Standard, half-step down', 3);

  INSERT INTO track_rigs (song_id, rig_id, rig_name, tweak_note, position)
  VALUES (
    v_song,
    v_rig,
    'Fernando''s Folk-Pop Rig',
    'Capo moved to the 2nd fret for this take.',
    0
  );

  INSERT INTO post_merge_data_backfills (name) VALUES ('task_1643_demo_rig');
  RAISE NOTICE 'task-1643 demo rig seeded on song %', v_song;
END $$;
SQL
  then
    echo "post-merge: task-1643 demo rig ok on $label"
  else
    echo "post-merge: WARNING — task-1643 demo rig failed on $label (continuing)"
  fi
}
seed_task_1643_demo_rig dev  "${DATABASE_URL:-}"
seed_task_1643_demo_rig prod "${PROD_DATABASE_URL:-}"

# Task #1710 — Strip Apple Music's boilerplate "Listen to music by … on Apple
# Music." sentence out of person/vendor/label bios that the scraper captured
# before we started filtering it at import. One-time, marker-guarded via
# post_merge_data_backfills so it runs exactly once per DB and never re-touches
# operator edits. Runs on BOTH dev and prod. Idempotent + best-effort: a
# failure here never blocks a merge.
backfill_task_1710_strip_apple_bio() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1710 apple-bio strip on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1710_strip_apple_bio') THEN
    RAISE NOTICE 'task-1710 apple-bio strip already applied — skipping';
    RETURN;
  END IF;

  -- Remove the boilerplate sentence; if nothing alphanumeric survives, null it.
  UPDATE people
  SET bio = NULLIF(
    trim(regexp_replace(bio, 'listen to music by .+? on apple music\.?', ' ', 'gi')),
    ''
  )
  WHERE bio ~* 'listen to music by .+? on apple music';
  UPDATE people SET bio = NULL
  WHERE bio IS NOT NULL AND bio !~ '[A-Za-z0-9]';

  UPDATE vendors
  SET bio = NULLIF(
    trim(regexp_replace(bio, 'listen to music by .+? on apple music\.?', ' ', 'gi')),
    ''
  )
  WHERE bio ~* 'listen to music by .+? on apple music';
  UPDATE vendors SET bio = NULL
  WHERE bio IS NOT NULL AND bio !~ '[A-Za-z0-9]';

  UPDATE labels
  SET bio = NULLIF(
    trim(regexp_replace(bio, 'listen to music by .+? on apple music\.?', ' ', 'gi')),
    ''
  )
  WHERE bio ~* 'listen to music by .+? on apple music';
  UPDATE labels SET bio = NULL
  WHERE bio IS NOT NULL AND bio !~ '[A-Za-z0-9]';

  INSERT INTO post_merge_data_backfills (name) VALUES ('task_1710_strip_apple_bio');
  RAISE NOTICE 'task-1710 apple-bio strip applied';
END $$;
SQL
  then
    echo "post-merge: task-1710 apple-bio strip ok on $label"
  else
    echo "post-merge: WARNING — task-1710 apple-bio strip failed on $label (continuing)"
  fi
}
backfill_task_1710_strip_apple_bio dev  "${DATABASE_URL:-}"
backfill_task_1710_strip_apple_bio prod "${PROD_DATABASE_URL:-}"

# Task #2057 — Re-strip Apple Music's boilerplate "Listen to music by … on
# Apple Music." sentence out of person bios. The original task-1710 sweep
# already ran (its marker is consumed), but the Apple Music *artist scraper*
# path never routed its bio through the strip helper, so artists imported from
# an Apple Music URL since then (e.g. CAKE) re-introduced the sentence into
# people.bio. The import + save paths are now fixed in code; this fresh
# marker-guarded sweep cleans the rows that re-dirtied in the meantime. Runs
# once per DB on BOTH dev and prod. Idempotent + best-effort: a failure here
# never blocks a merge.
backfill_task_2057_restrip_apple_bio() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-2057 apple-bio re-strip on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_2057_restrip_apple_bio') THEN
    RAISE NOTICE 'task-2057 apple-bio re-strip already applied — skipping';
    RETURN;
  END IF;

  -- Remove the boilerplate sentence; if nothing alphanumeric survives, null it.
  UPDATE people
  SET bio = NULLIF(
    trim(regexp_replace(bio, 'listen to music by .+? on apple music\.?', ' ', 'gi')),
    ''
  )
  WHERE bio ~* 'listen to music by .+? on apple music';
  UPDATE people SET bio = NULL
  WHERE bio IS NOT NULL AND bio !~ '[A-Za-z0-9]';

  INSERT INTO post_merge_data_backfills (name) VALUES ('task_2057_restrip_apple_bio');
  RAISE NOTICE 'task-2057 apple-bio re-strip applied';
END $$;
SQL
  then
    echo "post-merge: task-2057 apple-bio re-strip ok on $label"
  else
    echo "post-merge: WARNING — task-2057 apple-bio re-strip failed on $label (continuing)"
  fi
}
backfill_task_2057_restrip_apple_bio dev  "${DATABASE_URL:-}"
backfill_task_2057_restrip_apple_bio prod "${PROD_DATABASE_URL:-}"

# Task #1718 — Keep the GitHub build mirror in lock-step automatically.
# Codemagic builds iOS from github.com/billdenk/goodtunes-app (branch main).
# Replit is the source of truth; GitHub is only a build mirror. This step runs
# on EVERY merge to project main, so the merged HEAD lands on GitHub within the
# post-merge window — no more manual catch-up pushes, no more silent drift.
#
# Three gotchas (see .agents/memory/github-mirror-push.md for the full story):
#   1. Auth is a repo-scoped SSH DEPLOY KEY (GITHUB_MIRROR_DEPLOY_KEY secret),
#      not a PAT — it never expires and only works on this one mirror repo. The
#      private key is written to a 600 temp file, GIT_SSH_COMMAND points ssh at
#      it with IdentitiesOnly=yes, and GitHub's host identity is pinned via a
#      bundled known_hosts (StrictHostKeyChecking=yes — never disabled). The key
#      file is shredded on every exit path; it is never echoed.
#   2. The repo's LFS pre-push hook blocks on an SSH password prompt for the
#      Replit lfsurl, so the ref push uses --no-verify + GIT_LFS_SKIP_PUSH=1.
#      But GitHub's GH008 hook then rejects any commit that references an LFS
#      object GitHub's LFS store doesn't have yet, so STEP 2 first uploads —
#      targeted by oid, no fat-history walk — any attached_assets/*.{mp4,mov,
#      wav,zip,...} object the new commits added (over the SAME SSH transport).
#      The video files themselves stay irrelevant to the build; this just keeps
#      GitHub's hook satisfied.
#   3. The remote NAME differs per environment (and may be absent in a fresh
#      post-merge clone), so we push to the SSH URL directly instead of a remote
#      name. We force-push (mirror semantics): GitHub main is disposable and
#      must always equal project main even across history rewrites/rebases.
#
# Best-effort by design: a sync failure (offline, key missing, GitHub
# hiccup) logs a WARNING — now WITH the real git stderr (the old code piped it
# to /dev/null, which is how the mirror silently drifted ~2 days) — and never
# fails the merge. STEP 1 fetches the remote tip first so a diverged history
# can't balloon the push into a multi-GB pack that GitHub 500s on; steady-state
# pushes are then a handful of commits that finish in seconds.
GITHUB_MIRROR_URL="git@github.com:billdenk/goodtunes-app.git"

# GitHub's published SSH host public keys (source: https://api.github.com/meta
# -> .ssh_keys, and docs.github.com "GitHub's SSH key fingerprints"). Pinned in
# a known_hosts so the mirror push can VERIFY GitHub's identity without ever
# falling back to StrictHostKeyChecking=no (which would accept a MITM host key).
# If GitHub ever rotates these, refresh from api.github.com/meta.
github_mirror_known_hosts_contents() {
  cat <<'KNOWN_HOSTS'
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
KNOWN_HOSTS
}
# Best-effort: scrub Replit's internal npm proxy host out of package-lock.json
# before we force-push the mirror. Those `resolved` URLs (package-firewall.replit.local)
# only resolve inside Replit's network, so if one ever leaks into the lockfile the
# CodeMagic `npm ci` step dies with ENOTFOUND. Rewriting them to the public registry
# keeps the integrity hashes valid (content-based) and lets the build fetch the same
# tarballs. Commits the fix so the pushed HEAD carries it. Never fatal.
sanitize_lockfile_for_mirror() {
  [ -f package-lock.json ] || return 0
  grep -q "package-firewall.replit.local" package-lock.json 2>/dev/null || return 0
  echo "post-merge: lockfile references package-firewall.replit.local — rewriting to registry.npmjs.org"
  sed -i 's#http://package-firewall\.replit\.local/npm/#https://registry.npmjs.org/#g' package-lock.json || {
    echo "post-merge: WARNING — lockfile sanitize sed failed (continuing)"; return 0; }
  if git -c user.email="bot@goodtunes.music" -c user.name="GoodTunes post-merge" \
       commit --no-verify -m "chore(mirror): repoint npm firewall lockfile URLs to public registry" \
       -- package-lock.json >/dev/null 2>&1; then
    echo "post-merge: committed sanitized package-lock.json"
  else
    echo "post-merge: WARNING — could not commit sanitized lockfile (continuing)"
  fi
}
# The GITHUB_MIRROR_DEPLOY_KEY secret is a multi-line OpenSSH private key, but
# secret-store and copy-paste round-trips routinely COLLAPSE its line breaks into
# spaces (single line). OpenSSH then rejects it ("Load key: error in libcrypto"
# -> Permission denied) and the mirror silently stops syncing. Rebuild a
# canonical PEM from whatever we receive: the base64 body never contains
# whitespace and the BEGIN/END markers are fixed, so stripping the markers + ALL
# whitespace and re-wrapping at 70 cols is loss-free AND idempotent (a correctly
# multi-line key round-trips byte-for-byte to the same canonical form). Any
# non-OpenSSH key is written verbatim (with the trailing newline OpenSSH needs)
# and left for ssh to validate. See .agents/memory/github-mirror-push.md.
write_normalized_deploy_key() {
  local raw="$1" out="$2" body
  case "$raw" in
    *"BEGIN OPENSSH PRIVATE KEY"*"END OPENSSH PRIVATE KEY"*)
      body=$(printf '%s' "$raw" \
        | sed -e 's/-----BEGIN OPENSSH PRIVATE KEY-----//' \
              -e 's/-----END OPENSSH PRIVATE KEY-----//' \
        | tr -d '[:space:]')
      {
        printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\n'
        printf '%s' "$body" | fold -w 70
        printf '\n-----END OPENSSH PRIVATE KEY-----\n'
      } > "$out"
      ;;
    *)
      printf '%s\n' "$raw" > "$out"
      ;;
  esac
}
sync_github_build_mirror() {
  if [ -z "${GITHUB_MIRROR_DEPLOY_KEY:-}" ]; then
    echo "post-merge: skipping GitHub mirror sync (GITHUB_MIRROR_DEPLOY_KEY not set)"
    return 0
  fi
  sanitize_lockfile_for_mirror
  local head
  head=$(git rev-parse HEAD 2>/dev/null || true)
  if [ -z "$head" ]; then
    echo "post-merge: WARNING — GitHub mirror sync skipped (could not resolve HEAD)"
    return 0
  fi

  # Auth = repo-scoped SSH deploy key (GITHUB_MIRROR_DEPLOY_KEY). Write the
  # private key + the pinned known_hosts to 600 temp files and shred them — plus
  # any temp ghlfs remote — on EVERY exit path via a single RETURN trap, so no
  # key material can linger on disk or in .git/config. The key value is never
  # echoed; only file PATHS appear in GIT_SSH_COMMAND.
  local keyfile knownhosts
  keyfile=$(mktemp) || { echo "post-merge: WARNING — GitHub mirror sync skipped (mktemp failed)"; return 0; }
  knownhosts=$(mktemp) || { rm -f "$keyfile"; echo "post-merge: WARNING — GitHub mirror sync skipped (mktemp failed)"; return 0; }
  trap 'rm -f "$keyfile" "$knownhosts" >/dev/null 2>&1; unset GIT_SSH_COMMAND; git remote remove ghlfs >/dev/null 2>&1 || true' RETURN
  chmod 600 "$keyfile" "$knownhosts"
  # Normalize the key into a canonical multi-line PEM (handles secret-store
  # newline-collapse; see write_normalized_deploy_key above).
  write_normalized_deploy_key "$GITHUB_MIRROR_DEPLOY_KEY" "$keyfile"
  github_mirror_known_hosts_contents > "$knownhosts"
  # IdentitiesOnly=yes  -> use ONLY this deploy key (ignore any agent/identity).
  # StrictHostKeyChecking=yes + pinned UserKnownHostsFile -> verify GitHub's host
  # key, never trust-on-first-use. BatchMode=yes -> never prompt (no tty here).
  export GIT_SSH_COMMAND="ssh -i $keyfile -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$knownhosts -o BatchMode=yes"

  echo "post-merge: syncing GitHub build mirror (main -> github.com/billdenk/goodtunes-app)"

  # TIME BUDGET (load-bearing): this whole function is the LAST, best-effort step
  # of post-merge, and the platform kills the ENTIRE script at its configured
  # timeout (300000ms). The idempotent dual-DB migration suite above already
  # burns ~110-120s every merge, so the mirror sync gets a HARD wall-clock
  # deadline (MIRROR_BUDGET seconds from here) and EVERY step below is clamped to
  # the time that actually remains. If the budget runs out we WARN and return 0:
  # a slow/diverged GitHub OR a big new LFS object degrades to "Codemagic catches
  # up next merge" instead of blowing the platform budget and failing the whole
  # post-merge. NEVER let a step run longer than the remaining budget, and never
  # raise MIRROR_BUDGET so high that migrations + mirror can exceed the platform
  # timeout (see .agents/memory/github-mirror-push.md "Time-budget coupling").
  local MIRROR_BUDGET=150
  local mirror_deadline=$((SECONDS + MIRROR_BUDGET))
  local have_remote=0 remain

  # STEP 1 — Fetch the remote tip FIRST. Without a common base git can't tell
  # which objects GitHub already has, so a diverged history makes every push
  # re-send the ENTIRE multi-GB closure -> GitHub returns HTTP 500 (pack too
  # large) and the mirror falls permanently behind. Fetching collapses the push
  # to the true (small) delta. Best-effort: if it fails we still try the push.
  remain=$((mirror_deadline - SECONDS))
  if [ "$remain" -gt 60 ]; then remain=60; fi
  if [ "$remain" -lt 5 ]; then
    echo "post-merge: WARNING — GitHub mirror sync out of time before fetch (skipping; next merge catches up)"
    return 0
  fi
  # Force refspec (leading '+'): across prior failed syncs the local tracking
  # ref ghmirror/main can drift AHEAD of GitHub's real tip, which makes a plain
  # fetch fail "non-fast-forward" -> have_remote stays 0 -> STEP 2 (LFS upload)
  # is skipped -> every new LFS object GH008-rejects the push forever. The '+'
  # resets the tracking ref to GitHub's actual tip so the delta/LFS diff is real.
  if GIT_TERMINAL_PROMPT=0 timeout "$remain" \
       git fetch --no-tags "$GITHUB_MIRROR_URL" "+main:refs/remotes/ghmirror/main" >/dev/null 2>&1
  then
    have_remote=1
  else
    echo "post-merge: NOTE — mirror fetch failed (still attempting push; pack may be large)"
  fi

  # STEP 2 — Proactively upload any LFS object the new commits reference that
  # GitHub's LFS store lacks (gotcha #2). Targeted by oid so there is NO
  # fat-history walk (`git lfs push --all` walks the whole ~4GB closure and
  # effectively hangs). Skipped when the fetch above gave us no base to diff.
  # The temp remote (ghlfs) carries the SSH URL so LFS auth rides the deploy key
  # too; the outer RETURN trap removes it on every exit path. Each object is
  # clamped to the remaining budget and we stop early (WARN) rather than overrun —
  # a still-missing object just GH008s the push, which WARNs and self-heals on a
  # later merge.
  if [ "$have_remote" = 1 ]; then
    local missing oid
    missing=$(comm -23 \
      <(git lfs ls-files -l HEAD 2>/dev/null | awk '{print $1}' | sort -u) \
      <(git lfs ls-files -l refs/remotes/ghmirror/main 2>/dev/null | awk '{print $1}' | sort -u) \
      2>/dev/null || true)
    if [ -n "$missing" ]; then
      echo "post-merge: uploading $(printf '%s\n' "$missing" | grep -c .) new LFS object(s) to GitHub LFS"
      git remote remove ghlfs >/dev/null 2>&1 || true
      git remote add ghlfs "$GITHUB_MIRROR_URL" >/dev/null 2>&1 || true
      for oid in $missing; do
        remain=$((mirror_deadline - SECONDS))
        if [ "$remain" -lt 15 ]; then
          echo "post-merge: WARNING — out of time; skipping remaining LFS upload(s) (next merge catches up)"
          break
        fi
        if [ "$remain" -gt 120 ]; then remain=120; fi
        GIT_TERMINAL_PROMPT=0 timeout "$remain" git lfs push --object-id ghlfs "$oid" 2>&1 || true
      done
      git remote remove ghlfs >/dev/null 2>&1 || true
    fi
  fi

  # STEP 3 — Force-push HEAD to main (mirror semantics: GitHub main is
  # disposable and must always equal project main). Capture output so a failure
  # is VISIBLE in the merge log instead of vanishing into /dev/null.
  local out rc=0
  remain=$((mirror_deadline - SECONDS))
  if [ "$remain" -lt 5 ]; then
    echo "post-merge: WARNING — GitHub mirror sync out of time before push (skipping; next merge catches up)"
    return 0
  fi
  if [ "$remain" -gt 90 ]; then remain=90; fi
  out=$(GIT_LFS_SKIP_PUSH=1 GIT_TERMINAL_PROMPT=0 timeout "$remain" \
          git push --no-verify --force "$GITHUB_MIRROR_URL" "HEAD:refs/heads/main" 2>&1) || rc=$?
  if [ "$rc" = 0 ]; then
    echo "post-merge: GitHub mirror sync ok ($head)"
  else
    echo "post-merge: WARNING — GitHub mirror sync failed rc=$rc (continuing; Codemagic may build stale code until the next successful sync)"
    printf '%s\n' "$out" | tail -8 | sed 's/^/post-merge:   mirror> /'
  fi
}

# Task #1873 — ensure Nightbirde's manager_id link is set on every DB clone
# (prod already carried this link; dev clones may not).  Idempotent +
# marker-guarded so a future merge never clobbers an operator's manual choice.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_nightbirde_id  constant text := '3ca615d6-7c04-422f-8dab-3f89607e648e';
  v_mitch_mgr_id   constant text := '9e037216-d205-4439-b558-825e1cf257ce';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills
     WHERE name = 'task_1873_nightbirde_mitch_manager_link'
  ) THEN
    -- NULL-guarded: only stamp if both rows exist and the link is not yet set.
    UPDATE people
       SET manager_id = v_mitch_mgr_id
     WHERE id = v_nightbirde_id
       AND manager_id IS NULL
       AND EXISTS (SELECT 1 FROM managers WHERE id = v_mitch_mgr_id)
       AND deleted_at IS NULL;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_1873_nightbirde_mitch_manager_link');
    RAISE NOTICE 'task_1873: Nightbirde manager link backfill applied (or skipped — already set)';
  ELSE
    RAISE NOTICE 'task_1873: Nightbirde manager link backfill already applied — skipping';
  END IF;
END
$$;
SQL

# Free the "gogoods" username so the operator (Bill) can claim it as his fan
# @handle. A legacy gogoods-imported fan (Nima Jalali, gogoods@jalali.net) got
# his username auto-derived from his email local-part ("gogoods") but NEVER
# claimed a public handle. customer_users.username is globally UNIQUE and the
# complete-signup flow mirrors username = handle on write, so that squatted
# username silently blocked the handle (picker said "available", save 500'd).
# This renames ONLY that one legacy account's username to a clean, name-derived
# value (his handle stays NULL, so nothing fan-facing changes for him — it only
# changes the handle he'd be suggested if he ever finishes signup).
#
# Tightly guarded: matches the exact legacy account by id + email, and only
# when username is still the auto-derived 'gogoods' AND no handle was ever
# claimed AND the target value is free (no other row owns it as username or
# handle). Marker-guarded + idempotent + self-idempotent via the WHERE clause;
# a no-op on a fresh dev clone (Nima is prod-only).
backfill_free_gogoods_handle() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping free-gogoods-handle on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
  v_nima  constant text := '520394de-5dee-49c4-9d0a-32cdc78572e4';
  v_email constant text := 'gogoods@jalali.net';
  v_new   constant text := 'nima.jalali';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'free_gogoods_handle'
  ) THEN
    -- Only rename when the target value is free, so we never trade one
    -- collision for another.
    IF NOT EXISTS (
      SELECT 1 FROM customer_users
       WHERE (lower(username) = v_new OR lower(handle) = v_new)
         AND id <> v_nima
    ) THEN
      UPDATE customer_users
         SET username = v_new
       WHERE id = v_nima
         AND lower(email) = v_email
         AND lower(username) = 'gogoods'
         AND handle IS NULL;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    INSERT INTO post_merge_data_backfills (name) VALUES ('free_gogoods_handle');
    RAISE NOTICE 'free_gogoods_handle applied: % rows', v_count;
  ELSE
    RAISE NOTICE 'free_gogoods_handle already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: free-gogoods-handle ok on $label"
    echo "$out" | grep -i 'free_gogoods_handle' || true
  else
    echo "post-merge: WARNING — free-gogoods-handle failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_free_gogoods_handle dev  "${DATABASE_URL:-}"
backfill_free_gogoods_handle prod "${PROD_DATABASE_URL:-}"

# Task #1899 — Backfill GoodDeed numbers onto existing paid order_copies rows
# that never got numbered (because before this task only signed-cert copies
# were assigned a number). Assigns numbers deterministically above the current
# per-album max, in order_id + position order, so already-assigned numbers are
# never changed and no number is reused. Marker-guarded so it runs exactly once.
backfill_task_1899_number_every_copy() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1899 number-every-copy backfill on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count    integer := 0;
  v_album_id text;
  v_copy_id  text;
  v_next     integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1899_number_every_copy'
  ) THEN
    -- For each album that has any paid order_copies with a null good_deed_number,
    -- assign sequential numbers above the current per-album max, walking copies
    -- in a stable order (order creation time, then copy position within the order).
    FOR v_album_id IN
      SELECT DISTINCT oc.album_id
        FROM order_copies oc
        JOIN orders o ON o.id = oc.order_id
       WHERE oc.good_deed_number IS NULL
         AND o.status IN ('paid', 'shipped')
    LOOP
      -- Floor = max already in play across orders + order_copies + user_albums
      SELECT GREATEST(
        COALESCE((SELECT MAX(good_deed_number) FROM orders       WHERE album_id = v_album_id), 0),
        COALESCE((SELECT MAX(good_deed_number) FROM order_copies WHERE album_id = v_album_id), 0),
        COALESCE((SELECT MAX(certificate_number) FROM user_albums WHERE album_id = v_album_id), 0)
      ) + 1 INTO v_next;

      -- Walk every un-numbered paid copy for this album in a stable order
      FOR v_copy_id IN
        SELECT oc.id
          FROM order_copies oc
          JOIN orders o ON o.id = oc.order_id
         WHERE oc.album_id = v_album_id
           AND oc.good_deed_number IS NULL
           AND o.status IN ('paid', 'shipped')
         ORDER BY o.created_at, o.id, oc.position
      LOOP
        UPDATE order_copies SET good_deed_number = v_next WHERE id = v_copy_id;
        v_next  := v_next + 1;
        v_count := v_count + 1;
      END LOOP;
    END LOOP;

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1899_number_every_copy');
    RAISE NOTICE 'task_1899_number_every_copy applied: % rows numbered', v_count;
  ELSE
    RAISE NOTICE 'task_1899_number_every_copy already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1899 number-every-copy ok on $label"
    echo "$out" | grep -i 'task_1899' || true
  else
    echo "post-merge: WARNING — task-1899 number-every-copy failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1899_number_every_copy dev  "${DATABASE_URL:-}"
backfill_task_1899_number_every_copy prod "${PROD_DATABASE_URL:-}"

# Task #1909 — ONE-TIME renumber of Hope 7" GoodDeed numbers by true
# purchase order (Andrew Goeken = #1). Early plain-record buyers were
# assigned numbers above the initial certificate buyers, and the
# order-level number was never written for those early orders (hex
# placeholder). This renumber:
#   • Assigns 1..N to all paid order_copies by (o.created_at, o.id, oc.position).
#   • Mirrors each order's good_deed_number to its first copy's new number.
# Two-phase write avoids transient collisions on the partial unique indexes:
# Phase 1 shifts all current numbers into a high temp range (+ 100000),
# Phase 2 writes the final 1..N values.
# Safe: production check confirms no cert has been confirmed/locked/printed.
backfill_task_1909_renumber_hope_gooddeed() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-1909 renumber-hope-gooddeed on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_album_id text    := 'b250a5a5-98cc-4673-9903-ab39e5278d8c';
  v_offset   integer := 100000;
  v_n        integer := 0;
  v_rec      record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_1909_renumber_hope_gooddeed'
  ) THEN
    -- Phase 1: shift all existing non-null Hope numbers into a high temp
    -- range so the partial unique indexes on (album_id, good_deed_number)
    -- have no conflicts when we write the final 1..N values below.
    UPDATE order_copies
       SET good_deed_number = good_deed_number + v_offset
     WHERE album_id = v_album_id
       AND good_deed_number IS NOT NULL
       AND order_id IN (
         SELECT id FROM orders
          WHERE album_id = v_album_id
            AND status IN ('paid', 'shipped')
       );

    UPDATE orders
       SET good_deed_number = good_deed_number + v_offset
     WHERE album_id = v_album_id
       AND good_deed_number IS NOT NULL
       AND status IN ('paid', 'shipped');

    -- Phase 2: assign 1..N to every paid copy in true purchase order
    -- (order created_at ASC, order id ASC for ties, copy position ASC
    -- for multi-unit orders so the same order gets a contiguous block).
    FOR v_rec IN
      SELECT oc.id AS copy_id
        FROM order_copies oc
        JOIN orders o ON o.id = oc.order_id
       WHERE oc.album_id = v_album_id
         AND o.status IN ('paid', 'shipped')
       ORDER BY o.created_at ASC, o.id ASC, oc.position ASC
    LOOP
      v_n := v_n + 1;
      UPDATE order_copies SET good_deed_number = v_n WHERE id = v_rec.copy_id;
    END LOOP;

    -- Mirror the order-level good_deed_number to that order's first
    -- copy's new number (the established order-level convention).
    -- Also fills in the order-level field for early plain-record orders
    -- that previously showed a hex placeholder (null order-level number).
    UPDATE orders o
       SET good_deed_number = (
         SELECT MIN(oc.good_deed_number)
           FROM order_copies oc
          WHERE oc.order_id = o.id
       )
     WHERE o.album_id = v_album_id
       AND o.status IN ('paid', 'shipped');

    INSERT INTO post_merge_data_backfills (name) VALUES ('task_1909_renumber_hope_gooddeed');
    RAISE NOTICE 'task_1909_renumber_hope_gooddeed applied: % copies renumbered', v_n;
  ELSE
    RAISE NOTICE 'task_1909_renumber_hope_gooddeed already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: task-1909 renumber-hope-gooddeed ok on $label"
    echo "$out" | grep -i 'task_1909' || true
  else
    echo "post-merge: WARNING — task-1909 renumber-hope-gooddeed failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_1909_renumber_hope_gooddeed dev  "${DATABASE_URL:-}"
backfill_task_1909_renumber_hope_gooddeed prod "${PROD_DATABASE_URL:-}"

# ─── Task #1931 — Viryl Technologies press catalog seed ──────────────────────
# Onboards Viryl Technologies Corp. (Toronto, ON) as a vinyl press: manufacturer
# record, 3 formats (12_lp / 12_double / 7_inch), 8 colour tiers per format
# (Black · Opaque · Metallic/Specialty · Transparent · Premium · Multi-colour ·
# Hand Pour · Splatter), all colours from the 2024 catalogue PDF with hex swatches
# and Viryl colour codes, and real per-unit-cents ladders for 12_lp (record cost +
# standard digitally-printed jacket + $0.13 insertion, qty breaks 50/100/200/300/
# 500/1000). 7_inch and 12_double jacket costs are Custom Quote → TBD rungs.
# Premium tier is Custom Quote across all formats. Marker-guarded
# (viryl_catalog_seed_v1) so operator edits are never clobbered on subsequent merges.
seed_viryl_catalog() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping viryl catalog seed on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(DATABASE_URL="$url" npx tsx scripts/seed-viryl-catalog.ts 2>&1); then
    echo "post-merge: viryl catalog seed ok on $label"
    echo "$out" | tail -8
  else
    echo "post-merge: WARNING — viryl catalog seed failed on $label (continuing)"
    echo "$out" | tail -10
  fi
}
seed_viryl_catalog dev  "${DATABASE_URL:-}"
seed_viryl_catalog prod "${PROD_DATABASE_URL:-}"

# patch-viryl-pricing: adds confirmed 7" (record+sleeve) and 12_double
# (2×record+2×sleeve, no gatefold) ladders. Marker-guarded (viryl_pricing_patch_v1).
patch_viryl_pricing() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping viryl pricing patch on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(DATABASE_URL="$url" npx tsx scripts/patch-viryl-pricing.ts 2>&1); then
    echo "post-merge: viryl pricing patch ok on $label"
    echo "$out" | tail -6
  else
    echo "post-merge: WARNING — viryl pricing patch failed on $label (continuing)"
    echo "$out" | tail -10
  fi
}
patch_viryl_pricing dev  "${DATABASE_URL:-}"
patch_viryl_pricing prod "${PROD_DATABASE_URL:-}"

# viryl-photos: extracts disc photos from the 2024 catalogue PDF, applies
# disc masking, uploads to Object Storage, stamps swatch_image_url.
# Marker-guarded (viryl_photos_v1). Requires attached_assets/Catalogue_2024_*.pdf.
run_viryl_photos() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping viryl photos on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(DATABASE_URL="$url" npx tsx scripts/viryl-photos.ts 2>&1); then
    echo "post-merge: viryl photos ok on $label"
    echo "$out" | tail -6
  else
    echo "post-merge: WARNING — viryl photos failed on $label (continuing)"
    echo "$out" | tail -10
  fi
}
run_viryl_photos dev  "${DATABASE_URL:-}"
run_viryl_photos prod "${PROD_DATABASE_URL:-}"

# patch-viryl-180g: adds 12" 180g jacket pricing + records-only (no jacket)
# option for the standard 12_lp format. Marker-guarded (viryl_180g_patch_v1).
run_viryl_180g() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping viryl 180g patch on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(DATABASE_URL="$url" npx tsx scripts/patch-viryl-180g.ts 2>&1); then
    echo "post-merge: viryl 180g patch ok on $label"
    echo "$out" | tail -6
  else
    echo "post-merge: WARNING — viryl 180g patch failed on $label (continuing)"
    echo "$out" | tail -10
  fi
}
run_viryl_180g dev  "${DATABASE_URL:-}"
run_viryl_180g prod "${PROD_DATABASE_URL:-}"

# Task #1938 — Gifting hub schema. Add new columns needed for the
# post-purchase gift hub: buyer-initiated revoke + gift type on gifts,
# decide-later decision tracking on orders. Idempotent ADD COLUMN IF NOT EXISTS.
migrate_gifting_hub_columns() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping gifting hub migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS buyer_revoked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS gift_type         text;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pending_gift_decision            boolean,
  ADD COLUMN IF NOT EXISTS pending_gift_decision_expires_at timestamptz;
COMMIT;
SQL
  then
    echo "post-merge: gifting hub columns ok on $label"
  else
    echo "post-merge: WARNING — gifting hub column migration failed on $label (continuing)"
  fi
}
migrate_gifting_hub_columns dev  "${DATABASE_URL:-}"
migrate_gifting_hub_columns prod "${PROD_DATABASE_URL:-}"

# Task #1984 — Normalize legacy gear-credit role text. Before the Add-gear
# panel got its canonical pill picker (Task #1983), "Role on these tracks"
# was free text, so existing track_performers.role values are inconsistent
# ("guitars", "Gtr", "lead vox", …). This one-time pass maps those onto the
# canonical GEAR_ROLES vocabulary where there's an UNAMBIGUOUS match
# (case-insensitive exact + a curated synonym table). Genuinely off-list or
# compound roles ("Composer · Violin", custom escape-hatch values) don't
# match any synonym key, so they're left untouched. Marker-guarded
# (post_merge_data_backfills / gear_role_normalization_v1) so a later
# operator re-type isn't clobbered on the next merge; the WHERE clause only
# rewrites rows that actually differ, so it's also naturally idempotent.
backfill_gear_role_normalization() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping gear-role normalization on $label (no URL set)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A <<'SQL' 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'gear_role_normalization_v1'
  ) THEN
    WITH synonyms(src, canonical) AS (VALUES
      -- Guitar
      ('guitar','Guitar'),('guitars','Guitar'),('gtr','Guitar'),('gtrs','Guitar'),
      ('electric guitar','Guitar'),('acoustic guitar','Guitar'),
      ('rhythm guitar','Guitar'),('lead guitar','Guitar'),
      -- Bass
      ('bass','Bass'),('basses','Bass'),('bass guitar','Bass'),('electric bass','Bass'),
      -- Keys
      ('keys','Keys'),('key','Keys'),('keyboard','Keys'),('keyboards','Keys'),
      ('piano','Keys'),('pianos','Keys'),
      -- Drums
      ('drum','Drums'),('drums','Drums'),('drum kit','Drums'),('drumkit','Drums'),
      ('drum set','Drums'),
      -- Percussion
      ('percussion','Percussion'),('percussions','Percussion'),('perc','Percussion'),
      -- Strings
      ('strings','Strings'),('string','Strings'),
      -- Violin
      ('violin','Violin'),('violins','Violin'),('fiddle','Violin'),
      -- Viola
      ('viola','Viola'),('violas','Viola'),
      -- Cello
      ('cello','Cello'),('cellos','Cello'),('violoncello','Cello'),
      -- Brass
      ('brass','Brass'),
      -- Woodwind
      ('woodwind','Woodwind'),('woodwinds','Woodwind'),('wood wind','Woodwind'),
      -- Lead vocals
      ('lead vocals','Lead vocals'),('lead vocal','Lead vocals'),('lead vox','Lead vocals'),
      ('lead voc','Lead vocals'),('vocals','Lead vocals'),('vocal','Lead vocals'),
      ('vox','Lead vocals'),('voice','Lead vocals'),
      -- Backing vocals
      ('backing vocals','Backing vocals'),('backing vocal','Backing vocals'),
      ('background vocals','Backing vocals'),('background vocal','Backing vocals'),
      ('backup vocals','Backing vocals'),('harmony vocals','Backing vocals'),
      ('bgv','Backing vocals'),('bgvs','Backing vocals'),('bvs','Backing vocals'),
      -- Production
      ('production','Production'),('producer','Production'),
      ('produced by','Production'),('produced','Production')
    )
    UPDATE track_performers tp
       SET role = s.canonical
      FROM synonyms s
     WHERE lower(btrim(tp.role)) = s.src
       AND tp.role <> s.canonical;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name) VALUES ('gear_role_normalization_v1');

    RAISE NOTICE 'task-1984 gear-role normalization applied: % rows rewritten', v_count;
  ELSE
    RAISE NOTICE 'task-1984 gear-role normalization already applied — skipping';
  END IF;
END
$$;
COMMIT;
SQL
  ); then
    echo "post-merge: gear-role normalization ok on $label"
    echo "$out" | grep -i 'task-1984' || true
  else
    echo "post-merge: WARNING — gear-role normalization failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_gear_role_normalization dev  "${DATABASE_URL:-}"
backfill_gear_role_normalization prod "${PROD_DATABASE_URL:-}"

# Task #1998 — format-aware jackets: add applicable_formats column to
# press_jackets (NULL = applies to all formats, back-compat default).
migrate_press_jacket_applicable_formats() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_jackets.applicable_formats migration on $label (no URL)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
ALTER TABLE press_jackets
  ADD COLUMN IF NOT EXISTS applicable_formats jsonb;
SQL
  ); then
    echo "post-merge: press_jackets.applicable_formats migration ok on $label"
  else
    echo "post-merge: WARNING — press_jackets.applicable_formats migration failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
migrate_press_jacket_applicable_formats dev  "${DATABASE_URL:-}"
migrate_press_jacket_applicable_formats prod "${PROD_DATABASE_URL:-}"

# Task #1998 — one-time backfill: set applicable_formats from jacket name
# using the smart-default rule (gatefold→12s only, wide-spine→2LP only).
# Marker-guarded so operator edits are never clobbered on re-run.
backfill_press_jacket_applicable_formats() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_jacket applicable_formats backfill on $label (no URL)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'press_jacket_applicable_formats_v1'
  ) THEN
    -- Gatefolds apply to 12" formats only (not 7" — no gatefold 7" sleeve).
    -- Exclude negated names like "Records…(No Gatefold)" or "…without gatefold".
    UPDATE press_jackets
       SET applicable_formats = '["12_lp","12_double"]'::jsonb
     WHERE lower(name) LIKE '%gatefold%'
       AND lower(name) NOT LIKE '%no gatefold%'
       AND lower(name) NOT LIKE '%without gatefold%'
       AND applicable_formats IS NULL;

    -- Wide-spine is a 2LP-only physical product.
    UPDATE press_jackets
       SET applicable_formats = '["12_double"]'::jsonb
     WHERE (
           lower(name) LIKE '%widespine%'
        OR lower(name) LIKE '%wide-spine%'
        OR lower(name) LIKE '%wide spine%'
     )
       AND applicable_formats IS NULL;

    -- Standard jackets keep NULL (applies to all formats).

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('press_jacket_applicable_formats_v1');

    RAISE NOTICE 'task-1998 press_jacket applicable_formats backfill applied';
  ELSE
    RAISE NOTICE 'task-1998 press_jacket applicable_formats backfill already applied — skipping';
  END IF;
END
$$;
SQL
  ); then
    echo "post-merge: press_jacket applicable_formats backfill ok on $label"
    echo "$out" | grep -i 'task-1998' || true
  else
    echo "post-merge: WARNING — press_jacket applicable_formats backfill failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_press_jacket_applicable_formats dev  "${DATABASE_URL:-}"
backfill_press_jacket_applicable_formats prod "${PROD_DATABASE_URL:-}"

# Task #53 — New-fan welcome sheet: add newFanWelcomeSeenAt and
# notifyNewMusicOptIn to customer_users on both DBs. Both columns are
# optional (nullable), so adding them is non-destructive and safe on a
# live database without a lock.
add_new_fan_welcome_columns() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping new-fan-welcome columns on $label (no URL)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS new_fan_welcome_seen_at  timestamp,
  ADD COLUMN IF NOT EXISTS notify_new_music_opt_in  boolean;
SQL
  ); then
    echo "post-merge: new-fan-welcome columns ok on $label"
  else
    echo "post-merge: WARNING — new-fan-welcome columns failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
add_new_fan_welcome_columns dev  "${DATABASE_URL:-}"
add_new_fan_welcome_columns prod "${PROD_DATABASE_URL:-}"

# Task #2021 — one-time cleanup of albums whose NOT-NULL `artwork` column holds
# the literal string "null"/"undefined" (a stale `String(nullish)` write). Those
# render as `<img src="null">` → the browser's broken-image "?" glyph. We reset
# them to "" so the client's <AlbumCover> shows the branded placeholder instead.
# The create/update routes now normalize these on write, so this only mops up
# rows that predate that guard (e.g. "Cool Tapes"). Marker-guarded in
# post_merge_data_backfills + targeted ONLY at the literal bad values, so it can
# never touch a real cover and never re-runs to clobber a later operator edit.
backfill_task_2021_album_artwork_cleanup() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-2021 album artwork cleanup on $label (no URL)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_2021_album_artwork_null_string_cleanup'
  ) THEN
    UPDATE albums
       SET artwork = ''
     WHERE artwork IN ('null', 'undefined');
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO post_merge_data_backfills (name)
    VALUES ('task_2021_album_artwork_null_string_cleanup');

    RAISE NOTICE 'task-2021 album artwork cleanup applied: % rows fixed', v_count;
  ELSE
    RAISE NOTICE 'task-2021 album artwork cleanup already applied — skipping';
  END IF;
END
$$;
SQL
  ); then
    echo "post-merge: task-2021 album artwork cleanup ok on $label"
    echo "$out" | grep -i 'task-2021' || true
  else
    echo "post-merge: WARNING — task-2021 album artwork cleanup failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
backfill_task_2021_album_artwork_cleanup dev  "${DATABASE_URL:-}"
backfill_task_2021_album_artwork_cleanup prod "${PROD_DATABASE_URL:-}"

# Task #2020 — Auto-run GoodSync after upload: add auto_goodsync_status to
# songs on both DBs. Nullable text column tracking the background-GoodSync
# lifecycle (pending → processing → done|instrumental|failed); adding it is
# non-destructive and safe on a live database without a lock.
add_auto_goodsync_status_column() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping auto_goodsync_status column on $label (no URL)"
    return 0
  fi
  local out
  if out=$(psql "$url" -v ON_ERROR_STOP=1 <<'SQL' 2>&1
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS auto_goodsync_status text;
SQL
  ); then
    echo "post-merge: auto_goodsync_status column ok on $label"
  else
    echo "post-merge: WARNING — auto_goodsync_status column failed on $label (continuing)"
    echo "$out" | tail -5
  fi
}
add_auto_goodsync_status_column dev  "${DATABASE_URL:-}"
add_auto_goodsync_status_column prod "${PROD_DATABASE_URL:-}"

# Task #2061 — per-box recipient personalization for custom add-ons (the
# "Gift of Hope" gifting flow). custom_addon_gift_boxes holds one row per
# purchased donation box; the buyer personalizes each AFTER checkout so the
# owning non-profit / fulfiller gets a recipient name + shipping address.
# shared/schema.ts declares the table; hand-apply the canonical CREATE TABLE
# on BOTH dev and prod so the schema-drift guard stays green on a freshly-
# cloned dev and the publish dev→prod diff stays empty. Idempotent.
migrate_custom_addon_gift_boxes() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping custom_addon_gift_boxes migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS custom_addon_gift_boxes (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        varchar NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id   varchar NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  addon_id        varchar NOT NULL,
  buyer_user_id   varchar NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  organization_id varchar,
  org_name        text,
  fulfiller       text,
  position        integer NOT NULL DEFAULT 0,
  mode            text,
  recipient_name  text,
  recipient_phone text,
  address1        text,
  address2        text,
  city            text,
  zip             text,
  state           text,
  giver_name      text,
  message         text,
  personalized_at timestamp,
  created_at      timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_addon_gift_boxes_item_position_uniq
  ON custom_addon_gift_boxes (order_item_id, position);
CREATE INDEX IF NOT EXISTS custom_addon_gift_boxes_order_idx
  ON custom_addon_gift_boxes (order_id);
CREATE INDEX IF NOT EXISTS custom_addon_gift_boxes_buyer_idx
  ON custom_addon_gift_boxes (buyer_user_id);
CREATE INDEX IF NOT EXISTS custom_addon_gift_boxes_org_idx
  ON custom_addon_gift_boxes (organization_id);
COMMIT;
SQL
  then
    echo "post-merge: custom_addon_gift_boxes migration ok on $label"
  else
    echo "post-merge: WARNING — custom_addon_gift_boxes migration failed on $label (continuing)"
  fi
}
migrate_custom_addon_gift_boxes dev  "${DATABASE_URL:-}"
migrate_custom_addon_gift_boxes prod "${PROD_DATABASE_URL:-}"

# Task #2012 — per-album "announced to the global new-music opt-in list" marker.
# Idempotent additive column so the schema-drift guard passes on both DBs and
# the operator single-shot announce guard has somewhere to stamp.
migrate_album_new_music_notified() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping albums.new_music_notified_at migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
ALTER TABLE IF EXISTS albums
  ADD COLUMN IF NOT EXISTS new_music_notified_at timestamp;
COMMIT;
SQL
  then
    echo "post-merge: albums.new_music_notified_at migration ok on $label"
  else
    echo "post-merge: WARNING — albums.new_music_notified_at migration failed on $label (continuing)"
  fi
}
migrate_album_new_music_notified dev  "${DATABASE_URL:-}"
migrate_album_new_music_notified prod "${PROD_DATABASE_URL:-}"

# Task #2109 — operator-editable press template specs, stored in the press
# CATALOG (keyed manufacturers.id → AlbumFormat → component). The album
# Pressing completed-template check resolves these OVER the measured
# baseline constants. Schema-drift-guard covers the table; this creates it
# on both DBs. Named unique index (not a constraint) mirrors the
# completed_template_checks precedent — the storage upsert + seed both
# conflict on the column LIST, so index-vs-constraint is functionally moot.
migrate_press_template_specs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping press_template_specs migration on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS press_template_specs (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  press_id            varchar NOT NULL,
  format              text    NOT NULL,
  component_key       text    NOT NULL,
  variant_key         text    NOT NULL DEFAULT '',
  disc_count          integer NOT NULL DEFAULT 0,
  artboard_w_inches   double precision,
  artboard_h_inches   double precision,
  expected_pages      integer,
  color               text,
  fonts_rule          text,
  template_file_url   text,
  updated_by_user_id  varchar,
  updated_at          timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS press_template_spec_uniq
  ON press_template_specs (press_id, format, component_key, variant_key, disc_count);
COMMIT;
SQL
  then
    echo "post-merge: press_template_specs migration ok on $label"
  else
    echo "post-merge: WARNING — press_template_specs migration failed on $label (continuing)"
  fi
}
migrate_press_template_specs dev  "${DATABASE_URL:-}"
migrate_press_template_specs prod "${PROD_DATABASE_URL:-}"

# Task #2109 — ONE-TIME seed: migrate MRP's measured artboard sizes (real
# Nov-2025 print-ready files) into Memphis Record Pressing's catalog so the
# one press we have confirmed data for is genuinely catalog-backed, not
# code-only. Seeds ONLY the disc-count-independent artboard dimensions
# (labels, per-disc inner sleeve, old-style gatefold jacket) — color and
# page counts stay NULL so the per-disc baseline still governs them, making
# this a behavior-neutral migration whose only effect is that the dims now
# live in the editable catalog. Marker-guarded + ON CONFLICT DO NOTHING so
# later operator edits are never clobbered; marker is only stamped once a
# Memphis row exists, so a not-yet-seeded clone retries on a later merge.
seed_task_2109_mrp_template_specs() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo "post-merge: skipping task-2109 mrp template specs seed on $label (no URL set)"
    return 0
  fi
  if psql "$url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name        text PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now()
);
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM post_merge_data_backfills WHERE name = 'task_2109_mrp_template_specs'
  ) AND EXISTS (
    SELECT 1 FROM manufacturers WHERE lower(name) LIKE '%memphis%'
  ) THEN
    INSERT INTO press_template_specs
      (press_id, format, component_key, variant_key, disc_count,
       artboard_w_inches, artboard_h_inches)
    SELECT m.id, f.fmt, c.comp, c.variant, 0, c.w, c.h
    FROM manufacturers m
    CROSS JOIN (VALUES
      ('labels',       '',                  6.5::double precision,    7.6811::double precision),
      ('inner_sleeve', '',                 19.0935::double precision, 30.9685::double precision),
      ('jacket',       'gatefold_oldstyle', 27.25::double precision,  27.0::double precision)
    ) AS c(comp, variant, w, h)
    CROSS JOIN (VALUES ('12_lp'), ('12_double')) AS f(fmt)
    WHERE lower(m.name) LIKE '%memphis%'
    ON CONFLICT (press_id, format, component_key, variant_key, disc_count) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO post_merge_data_backfills (name) VALUES ('task_2109_mrp_template_specs');
    RAISE NOTICE 'task-2109 mrp template specs seeded: % rows', v_count;
  END IF;
END $$;
COMMIT;
SQL
  then
    echo "post-merge: task-2109 mrp template specs seed ok on $label"
  else
    echo "post-merge: WARNING — task-2109 mrp template specs seed failed on $label (continuing)"
  fi
}
seed_task_2109_mrp_template_specs dev  "${DATABASE_URL:-}"
seed_task_2109_mrp_template_specs prod "${PROD_DATABASE_URL:-}"

sync_github_build_mirror
