# Auth & Dual Shell

Dual auth shipped in Task #31. Two completely separate user tables, `users` (admin) and `customer_users` (fans), each with its own OAuth identities table (`admin_identities` / `customer_identities`) and its own `auth_tokens` row keyed by `kind`. The same human can hold both with the same email — they're independent records.

## Admin sign-in

Requires TOTP (Google Authenticator / 1Password / Authy) on top of password. First sign-in enrolls via QR; recovery codes are scrypt-hashed. Super-admin grant/revoke UI lives on the admin Promote panel (`SuperAdminsPanel`).

The current single-tier admin generalizes into per-org roles in the next phase — see "Roles, fulfillment & multi-tenant admin" in `docs/roadmap.md`.

## OAuth (customer + admin)

Apple + Google OAuth both wired (Apple is **inert until a real PKCS#8 private key replaces the placeholder secret** — `APPLE_CONFIGURED` gate in `server/auth/oauth.ts`).

### Login-page provider lookup (Task #45)

`POST /api/auth/lookup` returns `{ exists, provider }` on email blur so the customer login form can swap the password field for "Continue with Google/Apple" when the account is OAuth-only — stops the silent "invalid credentials" lockout. Per-IP rate limit (30/min), 80ms constant-time floor, no PII in response.

### Apple private-relay capture (Task #45)

When Apple Sign-In returns `@privaterelay.appleid.com`, the customer is prompted via `POST /api/customer/real-email/{start,confirm}` to add a real, deliverable email. Reuses the `emailVerifications` table + scrypt code hashing. The relay address stays on `customer_identities.email` (the link key); the real email overwrites `customer_users.email`. Account.tsx surfaces a backfill banner for existing relay-email customers.

## Host-based routing

- `admin.goodtunes.music` → admin shell
- `my.goodtunes.music` → customer shell
- `*.replit.app` works as dev with both shells reachable

CNAMEs at the user's DNS provider point both subdomains at the deployment. Apple domain-association file is served at `/.well-known/apple-developer-domain-association.txt` on both hosts via the `APPLE_DOMAIN_ASSOCIATION` env var.
