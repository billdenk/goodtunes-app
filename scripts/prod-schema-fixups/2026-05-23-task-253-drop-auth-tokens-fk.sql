-- Task #253: drop stale auth_tokens.user_id → users(id) foreign key.
--
-- Pre-dual-auth, every auth_tokens row pointed at users(id) and a FK
-- enforced it. The dual-auth refactor split admins (users) from customers
-- (customer_users) and removed the FK from shared/schema.ts, but
-- drizzle-kit's db:push does NOT drop FKs that disappear from the schema,
-- so the constraint silently survived in dev and prod and 500'd every
-- customer Google/Apple sign-in at the auth_tokens insert (the customer
-- UUID isn't in users.id).
--
-- Idempotent. Safe to re-run.
BEGIN;
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_user_id_users_id_fk;
COMMIT;
