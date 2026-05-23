# Auth & Dual Shell

Dual auth shipped in Task #31. Two completely separate user tables, `users` (admin) and `customer_users` (fans), each with its own OAuth identities table (`admin_identities` / `customer_identities`) and its own `auth_tokens` row keyed by `kind`. The same human can hold both with the same email — they're independent records.

## Admin sign-in

Requires TOTP (Google Authenticator / 1Password / Authy) on top of password. First sign-in enrolls via QR; recovery codes are scrypt-hashed. Super-admin grant/revoke UI lives on the admin Promote panel (`SuperAdminsPanel`).

The current single-tier admin generalizes into per-org roles in the next phase — see "Roles, fulfillment & multi-tenant admin" in `docs/roadmap.md`.

## OAuth (customer + admin)

Apple + Google OAuth both live. `APPLE_CONFIGURED` gate in `server/auth/oauth.ts` flips true when `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_SERVICES_ID` (`io.GoGoods.music`) and a PKCS#8 `APPLE_PRIVATE_KEY` are all set. `normalizeApplePrivateKey()` accepts either a full PEM block (`-----BEGIN PRIVATE KEY-----…`) or the raw base64 body of a `.p8` file and wraps it before handing to JOSE, so however the secret got pasted into the env, the ES256 client-secret signer just works. Startup prints a one-line `[auth] oauth: google=on apple=on (io.GoGoods.music)` summary so operators can confirm at-a-glance.

**Identity is keyed off the provider `sub`, never the email.** Apple "Hide my email" returns a per-(fan, app) `@privaterelay.appleid.com` forwarder; the OAuth callback's email-lookup branch (the "we found an account with this email" prompt) skips relay addresses entirely, because a relay row from a previous run would otherwise collide unrelated fans. Same fan re-signing in always matches via the stable `sub`.

### Login-page provider lookup (Task #45)

`POST /api/auth/lookup` returns `{ exists, provider }` on email blur so the customer login form can swap the password field for "Continue with Google/Apple" when the account is OAuth-only — stops the silent "invalid credentials" lockout. Per-IP rate limit (30/min), 80ms constant-time floor, no PII in response.

### Apple private-relay capture (Task #45)

When Apple Sign-In returns `@privaterelay.appleid.com`, the customer is prompted via `POST /api/customer/real-email/{start,confirm}` to add a real, deliverable email. Reuses the `emailVerifications` table + scrypt code hashing. The relay address stays on `customer_identities.email` (the link key); the real email overwrites `customer_users.email`. Account.tsx surfaces a backfill banner for existing relay-email customers.

## Host-based routing

- `admin.goodtunes.music` → admin shell
- `my.goodtunes.music` → customer shell
- `*.replit.app` works as dev with both shells reachable

CNAMEs at the user's DNS provider point both subdomains at the deployment. Apple's domain-association file is served at `/.well-known/apple-developer-domain-association.txt` on both hosts. Two ways to provide it: (1) commit the verification file Apple gives you to `public/.well-known/apple-developer-domain-association.txt` (preferred — survives redeploy, no secret-manager fiddling), or (2) set `APPLE_DOMAIN_ASSOCIATION` in the env. The route prefers the file when present and falls back to the env var.

## Customer signup verification email (Task #259)

New fans hit `POST /api/email-verifications/start` from the `my.goodtunes.music` login page; the handler hashes a 6-digit code, stores it on `email_verifications`, and — when `RESEND_API_KEY` is set — sends the branded `sendCustomerSignupCodeEmail` (fan copy, 15-minute TTL) via the same Resend transport as admin OTP. On a successful real send the response omits `devCode` and the code is **never** console-logged (would defeat the gate). If Resend rejects the send, the user gets a generic 500 "Couldn't send a code right now — please try again" and the underlying reason is logged server-side only — we never leak whether the address exists or whether mail is misconfigured. With no `RESEND_API_KEY` (local dev), behavior is unchanged: code logs to the workflow console and is echoed back as `devCode` so signup keeps working without an inbox.

## Partner invites + referrals (Task #78)

Single invite sheet at `/admin/invites` (super-admin only) covers every partner role: super-admin, label, artist, manufacturer, fulfillment, **and non-profit**. Non-profits live in the existing `organizations` table with `kind='non_profit'` — they share the org schema with labels/manufacturers rather than getting a parallel table, which keeps `people.referredByOrgId` pointing at one place.

- **Invite fields.** Email + role + optional scope picker (validated against the matching entity table) + **optional referrer** (artist or non-profit) + free-form welcome note (≤1000 chars).
- **Token lifetime.** 14 days. The DELETE button soft-revokes (writes `admin_invites.revoked_at`); the refresh button mints a fresh token, extends to a new 14-day window, re-emails the magic link, and stamps `resent_at` so the row shows when it was last touched.
- **Accept flow.** `/invite/:token` → set username + password → server promotes the user to admin, writes role + scope, and **wires the referrer onto the artist Person row** (`people.referred_by_person_id` or `referred_by_org_id`) if the new partner is an artist with a referrer attached. Response includes a `landingPath` so non-profits land on `/non-profit`, artists on `/artist`, labels on `/label`, everyone else on `/admin/albums`.
- **Referral credits.** `referral_credits` is the ledger: every paid order on a referred artist's album mints one row per referrer (artist + non-profit can both be set; both fire), at `people.referrer_per_unit_cents` (default $1). Unique on `(order_id, referrer_kind)` so retries are safe; status starts as `pending_payout`. Surfaces:
  - `/non-profit` — partner shell with KPIs, per-artist album rollup, outstanding invites.
  - Artist dashboard → **Referrals** tab — same KPIs scoped to the artist's own referrals.
  - Admin person Overview — referral summary panel (hidden when empty) for super-admin auditing.
- **Prod migration.** `scripts/prod-schema-fixups/2026-05-22-task-78-partner-invites.sql` — idempotent (`IF NOT EXISTS` everywhere). Adds `referrer_kind`, `referrer_scope_id`, `welcome_note`, `revoked_at`, `resent_at` to `admin_invites`; creates `referral_credits` + the unique index + the two referrer-by-kind partial indexes.

## Admin access guard + promote-from-customers (Task #256)

Three guardrails around who can reach the admin shell:

- **Founder safety net.** `bootstrapAccessGuard()` in `server/index.ts` upserts `users.role = 'super_admin'` for `bill@gogoods.com` at every boot (idempotent — no-op when already set, never mints a row from scratch since there's no password to seed). Pairs with the existing `billdenk@mac.com` dev shortcut.
- **Branded "access not authorized" modal.** `AccessNotAuthorizedDialog` replaces the silent `/admin → /account` bounce. The admin shell probes `POST /api/admin/access-request` whenever it sees no admin user; that endpoint reads the session directly (bypasses the host/kind check) so a customer cookie landing on the admin host is detected, records the visit in `admin_access_requests`, and emails every `super_admin` once per 24h via `sendAdminAccessRequestEmail`. Probe is graceful: 401 → no dialog, login screen as before.
- **"Make admin…" row action.** In `/admin/customers` (super_admin only), a per-row button opens the same role + scope picker `/admin/invites` uses (hoisted into `@/components/admin/RoleScopePicker`). On submit, `POST /api/admin/customers/:id/promote` finds or creates a `users` row matching the customer's email (copying username/displayName/realName/password verbatim, falling back to a `!oauth-only:` placeholder when the customer is OAuth-only) and copies their `customer_identities` to `admin_identities` so Google/Apple sign-in works on the admin shell too. Then calls `setUserRole` and marks any pending access-request resolved.
- **Prod migration.** `scripts/prod-schema-fixups/2026-05-23-task-256-access-requests.sql` — idempotent `CREATE TABLE IF NOT EXISTS admin_access_requests` + the founder `UPDATE`. Bootstrap also runs this on every boot so dev DBs catch up automatically.
