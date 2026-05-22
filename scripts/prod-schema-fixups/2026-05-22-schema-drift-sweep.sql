-- Task #154 — Prod schema-drift sweep.
-- Idempotent: every ADD COLUMN / CREATE TABLE uses IF NOT EXISTS.

BEGIN;

-- album_addons ───────────────────────────────────────────────────────
ALTER TABLE album_addons ADD COLUMN IF NOT EXISTS planned_quantity integer;

-- orders ─────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_transfer_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_amount_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cert_cost_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_owner_kind text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_owner_id varchar;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_error text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'direct';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_store_id varchar;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_order_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_order_token text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_shopify_order_id_key') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_shopify_order_id_key UNIQUE (shopify_order_id);
  END IF;
END $$;

-- payout_settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_settings (
  id varchar PRIMARY KEY DEFAULT 'default',
  platform_fee_pct integer NOT NULL DEFAULT 10,
  cert_cost_cents integer NOT NULL DEFAULT 1200,
  shopify_fee_cents integer NOT NULL DEFAULT 350,
  updated_at timestamp DEFAULT now()
);
INSERT INTO payout_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- payout_accounts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_accounts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL,
  owner_id varchar NOT NULL,
  stripe_account_id text NOT NULL UNIQUE,
  country text NOT NULL DEFAULT 'US',
  email text,
  payouts_enabled boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements_due jsonb,
  disabled_reason text,
  last_synced_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT payout_accounts_owner_unique UNIQUE (owner_kind, owner_id)
);

-- shopify_stores ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_stores (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain text NOT NULL UNIQUE,
  store_name text,
  access_token text NOT NULL,
  scopes text,
  installed_at timestamp DEFAULT now(),
  uninstalled_at timestamp
);

-- shopify_product_mappings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_product_mappings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id varchar NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_product_id text NOT NULL,
  shopify_variant_id text,
  shopify_product_title text,
  album_id varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  offer_signed_cert boolean NOT NULL DEFAULT false,
  signed_cert_price_cents integer,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shopify_mapping_unique_with_variant
  ON shopify_product_mappings (store_id, shopify_product_id, shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_mapping_unique_product_wide
  ON shopify_product_mappings (store_id, shopify_product_id)
  WHERE shopify_variant_id IS NULL;

-- shopify_redemption_codes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_redemption_codes (
  code varchar PRIMARY KEY,
  order_id varchar NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  redeemed_at timestamp,
  redeemed_by_user_id varchar,
  created_at timestamp DEFAULT now()
);

-- signed_cert_reservations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signed_cert_reservations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  stripe_checkout_session_id text UNIQUE,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

-- signed_cert_certificates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signed_cert_certificates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  short_id varchar NOT NULL UNIQUE,
  name_status text NOT NULL DEFAULT 'awaiting',
  confirmed_identity_kind text,
  confirmed_name text,
  paper_size text NOT NULL DEFAULT 'letter',
  paper_size_overridden boolean NOT NULL DEFAULT false,
  print_batch_id varchar,
  locked_at timestamp,
  printed_at timestamp,
  confirmed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- cert_print_batches ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cert_print_batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  format text NOT NULL,
  cert_count integer NOT NULL,
  downloaded_by_admin_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

-- cert_name_audits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cert_name_audits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_id varchar NOT NULL REFERENCES signed_cert_certificates(id) ON DELETE CASCADE,
  changed_by_kind text NOT NULL,
  changed_by_user_id varchar,
  from_identity_kind text,
  from_name text,
  to_identity_kind text NOT NULL,
  to_name text NOT NULL,
  at timestamp NOT NULL DEFAULT now()
);

COMMIT;
