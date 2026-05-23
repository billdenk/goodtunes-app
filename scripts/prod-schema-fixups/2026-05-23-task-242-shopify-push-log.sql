-- Task #242 — Push-to-Shopify audit trail.
CREATE TABLE IF NOT EXISTS shopify_push_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  store_id varchar NOT NULL,
  product_id varchar NOT NULL,
  action text NOT NULL,
  forced boolean NOT NULL DEFAULT false,
  conflicts text[],
  actor_user_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopify_push_log_album_id_idx ON shopify_push_log (album_id, created_at DESC);
