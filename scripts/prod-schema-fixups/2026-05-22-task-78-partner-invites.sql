-- Task #78 — Partner invites + referral credits.
-- Idempotent: every ADD COLUMN / CREATE TABLE uses IF NOT EXISTS.

BEGIN;

-- admin_invites — referrer capture + revoke/resent tracking + welcome note.
ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS referrer_kind text;
ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS referrer_scope_id varchar;
ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS welcome_note text;
ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS revoked_at timestamp;
ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS resent_at timestamp;

-- referral_credits — $1/unit ledger for paid units on referred artists.
CREATE TABLE IF NOT EXISTS referral_credits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL,
  referred_artist_id varchar NOT NULL,
  referrer_kind text NOT NULL,
  referrer_person_id varchar,
  referrer_org_id varchar,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending_payout',
  created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE referral_credits
  ADD COLUMN IF NOT EXISTS units integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS referral_credits_order_kind_uniq
  ON referral_credits (order_id, referrer_kind);
CREATE INDEX IF NOT EXISTS referral_credits_referrer_person_idx
  ON referral_credits (referrer_person_id) WHERE referrer_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_credits_referrer_org_idx
  ON referral_credits (referrer_org_id) WHERE referrer_org_id IS NOT NULL;

COMMIT;
