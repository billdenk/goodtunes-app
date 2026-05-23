-- Task #79 — Per-partner permissions + post-sale edit lock.
-- Idempotent: every ADD COLUMN / CREATE TABLE uses IF NOT EXISTS.

BEGIN;

-- albums.first_sold_at ────────────────────────────────────────────────
-- Stamped on first paid order (Stripe + Shopify webhooks + dev mint).
-- Drives the post-sale edit lock — partner edits require an unlock
-- override row or land in the pending_changes queue.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS first_sold_at timestamp;

-- Backfill from existing paid orders so albums that already sold pre-
-- merge are locked correctly. Picks the earliest paid order per album.
UPDATE albums a
   SET first_sold_at = sub.first_paid_at
  FROM (
    SELECT album_id, MIN(created_at) AS first_paid_at
      FROM orders
     WHERE status = 'paid'
     GROUP BY album_id
  ) sub
 WHERE a.id = sub.album_id
   AND a.first_sold_at IS NULL;

-- partner_permissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_permissions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind text NOT NULL,
  scope_id varchar NOT NULL,
  edit_metadata boolean NOT NULL DEFAULT false,
  upload_masters boolean NOT NULL DEFAULT false,
  map_shopify boolean NOT NULL DEFAULT false,
  manage_payouts boolean NOT NULL DEFAULT false,
  invite_subusers boolean NOT NULL DEFAULT false,
  metadata_edits_require_approval boolean NOT NULL DEFAULT true,
  updated_by_user_id varchar,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_permissions_scope_unique
  ON partner_permissions (scope_kind, scope_id);

-- pending_changes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id varchar NOT NULL,
  album_id varchar,
  scope_kind text NOT NULL,
  scope_id varchar NOT NULL,
  patch jsonb NOT NULL,
  submitted_by_user_id varchar NOT NULL,
  submitted_note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id varchar,
  reviewed_at timestamp,
  reviewer_note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_changes_status_idx
  ON pending_changes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_changes_album_idx
  ON pending_changes (album_id);

-- admin_overrides ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_overrides (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id varchar NOT NULL,
  granted_by_user_id varchar NOT NULL,
  reason text NOT NULL,
  expires_at timestamp,
  consumed_at timestamp,
  consumed_by_user_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_overrides_target_idx
  ON admin_overrides (target_table, target_id, consumed_at);

COMMIT;
