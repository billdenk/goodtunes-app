-- Task #242 — One-click Push album to Shopify as a draft product.
--
-- New album-level fields backing the Push flow:
--   max_redemptions             — inventory cap for the digital edition
--                                 variant on Shopify (NULL = uncapped).
--   signed_cert_retail_cents    — label's chosen fan-facing retail of the
--                                 signed-cert variant on Shopify (must be
--                                 >= the wholesale rung GoodTunes will
--                                 bill them at window close).
--   shopify_push_store_id       — which connected store the draft lives
--                                 on. SET NULL on delete so removing a
--                                 store doesn't orphan the album row.
--   shopify_push_product_id     — Shopify Admin product id (string).
--   shopify_push_edition_variant_id
--   shopify_push_cert_variant_id
--   shopify_pushed_at           — last successful push.
--   shopify_push_snapshot       — jsonb fingerprint of what we last pushed
--                                 (title/body/vendor/tags/prices/inventory),
--                                 compared on re-push to detect label edits
--                                 made on the Shopify side.
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS signed_cert_retail_cents integer,
  ADD COLUMN IF NOT EXISTS shopify_push_store_id varchar
    REFERENCES shopify_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shopify_push_product_id text,
  ADD COLUMN IF NOT EXISTS shopify_push_edition_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_push_cert_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_pushed_at timestamp,
  ADD COLUMN IF NOT EXISTS shopify_push_snapshot jsonb;
