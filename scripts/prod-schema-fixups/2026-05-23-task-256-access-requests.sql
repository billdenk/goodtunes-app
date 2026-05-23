-- Task #256 — Admin access guard + promote-from-customers.
--
-- Idempotent: safe to run any number of times against the prod DB.
--
-- 1. admin_access_requests — one row per customer who landed on the
--    admin shell. Used to dedupe the super_admin notification email
--    and to surface "fan asking for access" cues in admin UI.
CREATE TABLE IF NOT EXISTS admin_access_requests (
  customer_user_id varchar PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  first_requested_at timestamp NOT NULL DEFAULT NOW(),
  last_requested_at timestamp NOT NULL DEFAULT NOW(),
  last_notified_at timestamp,
  resolved_at timestamp
);

-- 2. Founder safety net — guarantee bill@gogoods.com is super_admin.
--    Only updates an EXISTING row; we never mint a users row from
--    scratch (no password to seed).
UPDATE users
   SET role = 'super_admin'
 WHERE lower(email) = 'bill@gogoods.com'
   AND (role IS NULL OR role <> 'super_admin');
