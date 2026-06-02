# Auth & Dual Shell

Dual auth shipped in Task #31. Two completely separate user tables, `users` (admin) and `customer_users` (fans), each with its own OAuth identities table (`admin_identities` / `customer_identities`) and its own `auth_tokens` row keyed by `kind`. The same human can hold both with the same email — they're independent records.

## Admin sign-in

Requires TOTP (Google Authenticator / 1Password / Authy) on top of password. First sign-in enrolls via QR; recovery codes are scrypt-hashed. Super-admin grant/revoke UI lives on the admin Promote panel (`SuperAdminsPanel`).

### Forgot password (Task #269)

`/admin/login` carries a **Forgot password?** link under the password field. It posts the entered email to `POST /api/admin/auth/forgot-password`, which is intentionally non-enumerating — the response is always the same neutral 200, with a constant-time floor and per-IP (20/hr) + per-email (5/hr) rate limits. When the email matches an admin with a real password (OAuth-only admins are silently skipped), we mint a SHA-256-hashed single-use token, persist it in `admin_password_reset_tokens` with a 30-minute expiry, and email the raw token via `sendAdminPasswordResetEmail` (same Resend transport as admin OTP). The recipient lands on `/admin/reset-password/:token`, which pre-validates the link via `GET /api/admin/auth/reset-password/:token` and then `POST`s the new password. The password update does **not** sign the user in — they bounce back to `/admin/login` where the existing 2FA gate (email-OTP or TOTP) still fires before they reach the admin shell. Successful reset invalidates every other outstanding reset token for that admin. Customer reset (`customer_users`) is out of scope for this task.

The current single-tier admin generalizes into per-org roles in the next phase — see "Roles, fulfillment & multi-tenant admin" in `docs/roadmap.md`.

## OAuth (customer + admin)

Apple + Google OAuth both live. `APPLE_CONFIGURED` gate in `server/auth/oauth.ts` flips true when `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_SERVICES_ID` (`io.GoGoods.music`) and a PKCS#8 `APPLE_PRIVATE_KEY` are all set. `normalizeApplePrivateKey()` accepts either a full PEM block (`-----BEGIN PRIVATE KEY-----…`) or the raw base64 body of a `.p8` file and wraps it before handing to JOSE, so however the secret got pasted into the env, the ES256 client-secret signer just works. Startup prints a one-line `[auth] oauth: google=on apple=on (io.GoGoods.music)` summary so operators can confirm at-a-glance.

**Identity is keyed off the provider `sub`, never the email.** Apple "Hide my email" returns a per-(fan, app) `@privaterelay.appleid.com` forwarder; the OAuth callback's email-lookup branch (the "we found an account with this email" prompt) skips relay addresses entirely, because a relay row from a previous run would otherwise collide unrelated fans. Same fan re-signing in always matches via the stable `sub`.

### Login-page provider lookup (Task #45)

`POST /api/auth/lookup` returns `{ exists, provider }` on email blur so the customer login form can swap the password field for "Continue with Google/Apple" when the account is OAuth-only — stops the silent "invalid credentials" lockout. Per-IP rate limit (30/min), 80ms constant-time floor, no PII in response.

### Apple private-relay capture (Task #45)

When Apple Sign-In returns `@privaterelay.appleid.com`, the customer is prompted via `POST /api/customer/real-email/{start,confirm}` to add a real, deliverable email. Reuses the `emailVerifications` table + scrypt code hashing. The relay address stays on `customer_identities.email` (the link key); the real email overwrites `customer_users.email`. Account.tsx surfaces a backfill banner for existing relay-email customers.

### Apple private-relay reattach for imported fans (Task #400)

The gogoods.com importer wrote each Apple-signed fan's stable
`@privaterelay.appleid.com` forwarder as the email on the imported
`customer_users` row (about 211 of them). The Apple OAuth callback
therefore has a special-case branch *before* the usual "we found an
account with this email" prompt:

If — and only if — the OAuth identity lookup misses (first time the
new GoodTunes side has seen this Apple `sub`) **and** the email Apple
gave us ends in `@privaterelay.appleid.com` **and** an existing
`customer_users` row carries that exact relay as its email **and**
that row has `legacy_gogoods_id` set, we *link* the fresh Apple
identity onto the imported row instead of minting a new one. The fan
keeps their orders + owned albums; the relay address is the same one
Apple has always returned for this fan, so this is a safe rejoin.

Non-relay emails always fall through to the standard collision prompt
(`?prompt=link`) — we never silently merge two different fans into
the same row.

See [`docs/migrations/gogoods-welcome-back.md`](./migrations/gogoods-welcome-back.md)
for the whole welcome-back flow (single-use email-link sign-in,
3-screen onboarding, admin wave-1 campaign, fan-initiated merge).

### Finish-signup for OAuth-minted fans (Task #537)

OAuth (Google/Apple) creates a `customer_users` row with whatever the
provider returned — for Apple Hide-My-Email that's an
`@privaterelay.appleid.com` mask + no name; for Google it's the
account email + real name. Before the fan can land in the player we
make them complete one Apple-Music-styled screen at `/finish-setup`:

- **Handle** — public `@handle`, vetted live against `reserved_handles`
  (verified-artist names + a top-N celebrity seed) and the case-
  insensitive partial unique index on `customer_users.handle`. Picker
  distinguishes "format / reserved / taken" so the copy can be honest
  ("this handle is held for the artist — pick another"). The submit
  writes `handle` *and* mirrors it onto `username` so playlist URLs,
  admin search, and the welcome-back routes keep working unchanged.
- **Display name** — pre-filled from the provider name (Google) or the
  email local-part fallback (Apple). Required, 1–80 chars.
- **Contact email or phone** — required *only* when the row's email is
  `@privaterelay.appleid.com`. Either field satisfies the requirement;
  full phone verification is out of scope here (a separate task gates
  gifting/payouts on it). The provider email stays on
  `customer_identities.email` as the link key; `customer_users.email`
  stays as-is for admin search; `contact_email` / `contact_phone` are
  what receipts/gifting/payouts read from.

Gating: `signupCompletedAt` (nullable timestamp on `customer_users`)
is null only for first-time OAuth signups. The router-level guard in
`client/src/App.tsx` redirects every navigation to `/finish-setup`
until it's stamped (allow-list: `/finish-setup`, `/login`, `/logout`,
`/error`). Password signups stamp `signup_completed_at = now()` and
write `handle` + `contactEmail` inside `/api/register`, so they never
see the screen. The migration in `scripts/post-merge.sh` backfills
every pre-existing row to `created_at` for the same reason.

Reserved handles are seeded in `scripts/post-merge.sh` from a top-N
celebrity list + every existing People-row name (lowercased and
stripped to `a–z 0–9 . _ -`). A Spotify-driven importer that expands
this list automatically is tracked separately under
[`docs/roadmap.md`](./roadmap.md).

Endpoints (all customer-side, behind `requireAuth`):

- `GET /api/auth/complete-signup/state` — returns pre-fill + the
  `isPrivateRelay` flag the picker uses to show the contact block.
- `GET /api/auth/handle-available?u=…` — live picker check; returns
  `{ ok, reason: 'format' | 'reserved' | 'taken' | null }`.
- `POST /api/auth/complete-signup` — submits handle + displayName
  + (optional) contactEmail/contactPhone, stamps `signup_completed_at`,
  and returns the freshly-shaped customer row.

## Host-based routing

- `admin.goodtunes.music` → admin shell
- `my.goodtunes.music` → customer shell
- `*.replit.app` works as dev with both shells reachable

CNAMEs at the user's DNS provider point both subdomains at the deployment. Apple's domain-association file is served at `/.well-known/apple-developer-domain-association.txt` on both hosts. Two ways to provide it: (1) commit the verification file Apple gives you to `public/.well-known/apple-developer-domain-association.txt` (preferred — survives redeploy, no secret-manager fiddling), or (2) set `APPLE_DOMAIN_ASSOCIATION` in the env. The route prefers the file when present and falls back to the env var.

### Self-heal on boot failure (Task #921)

Bill intermittently hit a **blank white screen** at `admin.goodtunes.music` after a redeploy — correct tab title, correct light admin body background, but React never painted. The server was healthy; the cause was a stale/orphaned page still pointing at an old content-hashed bundle that no longer exists, so a same-origin `<script>`/`<link>` 404'd and the shell never mounted. A manual reload always fixed it (`index.html` is `no-store`, so the reload fetches the fresh hash — see `server/static.ts`).

That manual reload is now automatic and **strictly bounded**, mirroring the Task #424 pre-mount note in `client/src/main.tsx`. Three pieces, all in lock-step on both the admin and customer shells:

1. **Capture-phase asset-error listener** (`installGlobalErrorReporter` in `client/src/components/GlobalErrorBoundary.tsx`). Resource-load failures fire an `error` event **on the element** that does **not** bubble, so the existing window-targeted listener never saw them — that's why the screen went silently white. The new listener runs in the **capture** phase to catch a failed `<script>`/`<link>` load, scoped to our own origin exactly like `isOurError` (foreign assets — preview chrome, extensions, beacons — are ignored so we never paint a banner over a healthy app, preserving Task #406). Broken `<img>`/`<audio>` are intentionally ignored: a missing album cover is not a fatal boot failure.

2. **One guarded reload, fail-closed** (`reportBootFailure` in `client/src/lib/bootHeal.ts`). A same-origin script/stylesheet 404, **or** the mount watchdog below, triggers at most **one** automatic reload — guarded by `firedThisLoad` (once per load) plus a durable cross-reload marker. The marker is a `sessionStorage` timestamp (one per 30s window) **with a `window.name` sentinel fallback** for contexts where storage throws (Safari Private Browsing, storage-partitioned/sandboxed embeds). Critically, if **neither** marker can be persisted, `reportBootFailure` does **not** reload — it fails closed straight to the banner, because an auto-reload with no surviving guard could loop forever. A genuinely broken deploy therefore reloads exactly once (or zero times if storage is fully blocked), then shows the visible brand fatal banner (`paintFatalBanner`, with the failing URL).

3. **Mount watchdog + success clear** (`armBootWatchdog` in `client/src/main.tsx`, `markBootSucceeded` from `client/src/App.tsx`). If nothing has painted into `#root` ~7s after the entry runs, it's treated as a failed boot (backstop for "rendered nothing for an unknown reason"). The instant React mounts, `App`'s effect calls `markBootSucceeded()` to clear the guard, so ordinary navigation and ordinary in-app runtime errors (which still route through `GlobalErrorBoundary` → `FriendlyError`) are never affected.

Do **not** remove the capture-phase listener or the watchdog: without them the stale-bundle case is a silent white screen with no banner and no recovery.

## Transactional mail — sender reputation rules (Task #380)

Resend is the only transport. Three rules keep our sending-domain reputation green so legitimate mail (admin password resets to Workspace inboxes like `bill@gogoods.com`) lands in the Inbox tab, not Quarantine or Spam:

1. **Never hit the real `RESEND_API_KEY` from test paths.** The May 23–24 2026 cluster of bounces from `reset-test-*@example.com` came from an ad-hoc QA pass of the customer forgot-password endpoint — every one of those bounces now sits permanently on the domain's sender record and silently downgrades deliverability for real Workspace recipients. As a hard defense, `sendViaResend()` in `server/mail.ts` checks the recipient domain against the **IANA-reserved synthetic sinks** (`example.com`, `example.org`, `example.net`, `test`, `invalid`, `localhost`, plus the `.test` / `.invalid` / `.example` / `.localhost` TLDs) and drops the send without ever calling Resend. The caller still gets a `SendResult`, so control flow is unchanged; the skip is observable as a `[mail-skip] template=… recipient_domain=…` log line.
2. **Green DMARC alignment is mandatory.** The Resend → Domains page for whatever subdomain `MAIL_FROM` resolves to (today `send.goodtunes.music`) must show SPF, DKIM, and DMARC all verified. Workspace silently quarantines mail from a sender whose DMARC is amber, even if SPF and DKIM are green. If you change `MAIL_FROM` to a new subdomain, re-verify all three at the registrar before flipping the env var.
3. **Mail failures are loud, recipients are private.** Every send goes through `sendViaResend()`, which emits a structured `[mail-failure] template=<name> recipient_domain=<domain> reason=<json>` log line on any non-2xx response or network throw. Recipient addresses are intentionally truncated to the domain — full local-parts are PII we don't want in operator logs. Recent failures are also kept in a 50-entry ring buffer (`getRecentMailFailures()` from `server/mail.ts`) so a future admin debug surface can render a stuck-queue indicator without trawling logs.

When you build a new mail flow, do not handle `!result.ok` with a one-off `console.warn` in the calling route — the central logger already covers it. Just call the template, await it, and (if appropriate) keep a non-prod dev-link console fallback so local development still works when Resend is unreachable.

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
