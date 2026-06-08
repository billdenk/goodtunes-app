# Auth & Dual Shell

Dual auth shipped in Task #31. Two separate user tables, `users` (admin) and `customer_users` (fans), each with its own OAuth identities table (`admin_identities` / `customer_identities`) and its own `auth_tokens` row keyed by `kind`. The two shells stay separate **records**, but they are no longer separate **accounts** — see "Unified identity" below.

## Unified identity (Task #1037)

One human = one account across both shells. The two tables are **linked**, not merged: `users.customer_user_id` (nullable, no DB FK — app-enforced, with a partial unique index so a fan links to at most one admin) points at the canonical `customer_users` row, and the **fan row is the source of truth** for the password and the OAuth identities. After linking, a single email/password and a single Google/Apple identity authenticate into BOTH `my/store/get.goodtunes.music` and `admin.goodtunes.music`. We chose LINK over a physical merge so the existing fan-side orders/library/identities never move and the admin 2FA gate keeps firing unchanged.

All cross-table writes go through one seam, `server/auth/identityLink.ts`, so the two rows never silently drift:

- **`linkAdminToCustomer(adminUserId, customerId)`** — sets the link (only when currently null, never re-points), **fills** the fan password from the admin row only when the fan has none (never overwrites a real password, and never copies an `!oauth-only:` placeholder — that isn't a hash), and mirrors OAuth identities **both ways** (fan↔admin) so a single Google/Apple sign-in resolves on either shell.
- **`writeLinkedPassword({adminUserId|customerId, hashed})`** — overwrites the password on BOTH linked rows so any explicit password write fully converges the credential. Every reset/change endpoint (admin reset, admin self-serve change, customer reset/set-password) calls this.
- **`mirrorCustomerIdentitiesToAdmin` / `mirrorAdminIdentitiesToCustomer` / `getAdminIdForCustomer` / `getCustomerIdForAdmin`** — bidirectional identity-mirror + link lookups. Identity convergence must run both directions (and the one-time backfill mirrors both ways too): a provider `sub` can be attached on either shell first, so a one-way mirror silently breaks one shell's OAuth for an already-dual human.
- **`mirrorIdentityToLinked(kind, userId, {provider, providerUserId, email})`** — *ongoing* attach convergence: after any single-shell `storage.linkIdentity` (OAuth link-from-profile, relay reattach), copy the new identity onto the linked counterpart so attaching a provider on one shell attaches it on both. The OAuth invite-accept path doesn't need it — `linkAdminToCustomer` runs after the attach and mirrors both ways.
- **`unlinkIdentityEverywhere(kind, userId, identityId)`** — *ongoing* detach convergence: `DELETE /api/auth/identities/:id` routes through this so removing a provider on one shell removes the matching `(provider, sub)` on the linked counterpart too (else a "removed" identity could still sign you in via the other shell). Returns the same boolean as the old `storage.unlinkIdentity` so the route still 404s an unknown id.

**No-lockout password rule.** Link only ever *fills* an empty side; it never overwrites. `POST /api/login` (admin) therefore accepts `users.password` **OR** the linked fan's canonical password, so a pre-existing admin whose two passwords still differ is never locked out. The first reset/change after that converges both rows via `writeLinkedPassword`. Customer login is unchanged.

**Where the link gets set — trusted paths only.** Because the admin-login fallback accepts the linked fan password as a *first factor*, a link may only be formed where ownership of the email/identity is already proven — otherwise an unverified link is a way to seed an admin first-factor for an email you don't own. Trusted paths: `/api/admin/customers/:id/promote` (now just "ensure a `users` row → `linkAdminToCustomer` → `setUserRole`" — promote collapsed into *add a membership*, returns `linkedCustomerId`; super-admin authenticated); both invite-accept paths (password `POST /api/invites/:token/accept` and OAuth invite-accept) link to an existing fan by `invite.email` (operator issued that invite); and the OAuth admin callback, which on a `sub` with no `admin_identity` resolves the linked admin via the matching `customer_identity` and mirrors it forward (provider-verified — and this runs *before* the email-collision `?prompt=link` redirect so a Google sign-in for a valid linked admin isn't bounced). `POST /api/auth/lookup` folds the linked fan's identities into the admin provider hint.

**`/api/register` does NOT auto-link.** Self-serve fan signup deliberately does not link to a same-email admin row — registration doesn't prove the registrant owns that admin email, and combined with the password fallback that would be a first-factor bypass. Apple private-relay (`@privaterelay.appleid.com`) and `@oauth.local` placeholders are likewise excluded from email-based linking — relay is keyed off the provider `sub`, never the email.

**One-time merge of existing duplicates.** `scripts/post-merge.sh` hand-applies the additive column + partial unique index on dev **and** prod (a relational FK would reappear on every publish dev→prod diff — see `auth-tokens-fk-recurrence.md`), then runs a marker-guarded (`post_merge_data_backfills` → `task_1037_link_humans`) one-shot merge: every unambiguous 1:1 `lower(email)` match (real emails only) gets linked, the empty fan credential filled, and the fan's identities mirrored onto the admin row. The marker makes it idempotent so a later password change is never clobbered.

## Hat-switcher + additive grants (Task #1038, unified-identity P3)

P3 builds on the linked account: one human can now hold many *hats* (super-admin, a label, an artist on another label, a press teammate) on that single login and switch between them, and every grant path ADDS a hat to the existing account instead of minting a parallel admin login or hard-blocking on "an admin with that email already exists."

- **Active hat per request.** `server/auth/activeMembership.ts` carries the chosen hat through the request via `AsyncLocalStorage`; middleware mounted right after `session()` reads `req.session.activeMembershipKey`. When the key is set and still valid, role resolution (`getUserRole` / `findMembershipForScope` via `getUserMemberships` in `roles.ts`) narrows to that one hat, so the sidebar, album list, reports, and edit-permissions all scope to it; otherwise it falls back to the account's highest-privileged hat. **An account with fewer than two memberships sees no switcher and zero behavior change.**
- **Switcher surface.** `GET /api/me/memberships` lists the hats (with `scopeName` + `isActive`); `POST /api/me/active-membership` sets/clears the active key after validating it against the account's real memberships. The picker lives in `AdminUserMenu`; default landing (`landingPathForUser`) resolves the highest-privileged hat.
- **Grants are additive (the seam: `applyAdminInviteGrant`).** Invite-create, both invite-accept paths (password + OAuth), partner-contacts add-admin, grant-admin-role, and customer→admin promote all attach a membership to an existing account rather than creating a second `users` row. Critically, the **password invite-accept refuses to take a new password for an email that already has a login** (returns `{ existingAccount: true }` and tells them to sign in) — a leaked invite link must never overwrite an existing credential. Revoke (`/api/admin/admins/revoke`) drops only the god hat, leaving partner hats + the linked fan account intact. Full mechanics in [`docs/roles-and-permissions.md`](./roles-and-permissions.md#hat-switcher--additive-grants-task-1038-unified-identity-p3).

Out of scope (still in `docs/roadmap.md`): removing the legacy role columns (the membership SET is additive + dual-written; legacy `users.role` stays the shipped source of truth and equals the primary hat).

## Admin sign-in

Requires TOTP (Google Authenticator / 1Password / Authy) on top of password. First sign-in enrolls via QR; recovery codes are scrypt-hashed. Super-admin grant/revoke UI lives on the admin Promote panel (`SuperAdminsPanel`).

### Forgot password (Task #269)

`/admin/login` carries a **Forgot password?** link under the password field. It posts the entered email to `POST /api/admin/auth/forgot-password`, which is intentionally non-enumerating — the response is always the same neutral 200, with a constant-time floor and per-IP (20/hr) + per-email (5/hr) rate limits. When the email matches an admin with a real password (OAuth-only admins are silently skipped), we mint a SHA-256-hashed single-use token, persist it in `admin_password_reset_tokens` with a 30-minute expiry, and email the raw token via `sendAdminPasswordResetEmail` (same Resend transport as admin OTP). The recipient lands on `/admin/reset-password/:token`, which pre-validates the link via `GET /api/admin/auth/reset-password/:token` and then `POST`s the new password. The password update does **not** sign the user in — they bounce back to `/admin/login` where the existing 2FA gate (email-OTP or TOTP) still fires before they reach the admin shell. Successful reset invalidates every other outstanding reset token for that admin. Customer reset (`customer_users`) is out of scope for this task.

The current single-tier admin generalizes into per-org roles in the next phase — see "Roles, fulfillment & multi-tenant admin" in `docs/roadmap.md`.

## OAuth (customer + admin)

Apple + Google OAuth both live. `APPLE_CONFIGURED` gate in `server/auth/oauth.ts` flips true when `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_SERVICES_ID` (`io.GoGoods.music`) and a PKCS#8 `APPLE_PRIVATE_KEY` are all set. `normalizeApplePrivateKey()` accepts either a full PEM block (`-----BEGIN PRIVATE KEY-----…`) or the raw base64 body of a `.p8` file and wraps it before handing to JOSE, so however the secret got pasted into the env, the ES256 client-secret signer just works. Startup prints a one-line `[auth] oauth: google=on apple=on (io.GoGoods.music)` summary so operators can confirm at-a-glance.

**Identity is keyed off the provider `sub`, never the email.** Apple "Hide my email" returns a per-(fan, app) `@privaterelay.appleid.com` forwarder; the OAuth callback's email-lookup branch (the "we found an account with this email" prompt) skips relay addresses entirely, because a relay row from a previous run would otherwise collide unrelated fans. Same fan re-signing in always matches via the stable `sub`.

**Capturing the real name at sign-up.** Google returns the fan's name in the userinfo response, so `exchangeGoogleCode` carries it on `identity.name`. Apple is the exception: it sends the name **only** in the form_post callback body's `user` field (`{ "name": { "firstName", "lastName" }, … }`), and **only on the very first authorization** — never in the id_token, never on later sign-ins. `handleProviderCallback` parses that body for `provider === "apple"` and folds first+last into `identity.name`. When a customer account is minted from OAuth, that name is stored as both `displayName` and `realName`, so the profile leads with the fan's actual name instead of guessing from the email local-part. If the provider gives us nothing (Apple Hide-My-Email with name withheld), `realName` stays null and the fan can add it on `/finish-setup`.

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
- `store.goodtunes.music` → customer shell, landing on the launch storefront (Task #936)
- `*.replit.app` works as dev with both shells reachable

**A presented Bearer token can override a stale, mismatched session — but only for THIS host's kind.** `getAuthFromRequest` checks the session before the Bearer token, so a linked account (an invited platform admin whose login is also a fan account) whose session's last-used `kind` is `customer` (they last signed in on the player) would otherwise be rejected on `admin.goodtunes.music` even with a valid admin token in hand — the symptom was a 401 when saving in the admin Edit Profile dialog. When the canonical host's `authKind` mismatches the session kind, the host/kind gate now honors a Bearer token whose kind matches *this* host before bouncing: holding the token proves the caller owns that hat. The boundary still holds — a fan-only session with no matching token can't act as admin, and an admin token still can't be used on a fan host. The decision lives in the pure, unit-tested `resolveAuthAcrossBoundary` helper (`server/routes.ts`, `server/authBoundary.test.ts`).

### Store launch host (Task #936)

`store.goodtunes.music` is a first-class fan-facing host that behaves **exactly** like `my.goodtunes.music` — it resolves to the `customer` auth kind (`kindFromRequest`/`detectAuthKind`), is exempt from the canonical-host 301 redirect, and shares every fan route. The only difference is the bare root: on the store host `/` redirects to `/store`, which renders the launch release through the existing preview-first album surface (`AlbumDetail`, reused with an `albumId` prop so the id stays out of the URL). The launch album is `STOREFRONT_LAUNCH_ALBUM_ID` in `shared/schema.ts` (Nightbirde "Hope", prod-only row); dev DBs can point it at a local album via `VITE_LAUNCH_ALBUM_ID`. `/store` is also reachable on any host for deep links + dev testing; deep links to `/album/:id` are unchanged. The whole purchase path (sign-in gate → `?buy=1` bounce-back → embedded Stripe checkout → `/welcome`) flows through the same components, so it works identically from either host.

**Post-purchase player hand-off is token-carried, not cookie-carried.** The preview + purchase funnel (`get.`/`store.goodtunes.music`) sells, but a fan plays what they own on the player host (`my.goodtunes.music`). Because the session cookie is host-only AND the customer bearer token in `localStorage` (`goodtunes_auth_token`) is host-scoped too, *neither* auth artifact crosses subdomains. So after checkout (`Welcome.tsx` finish) the funnel mints a fresh customer bearer token (`POST /api/checkout/player-handoff`, `requireCustomer` — customer-only so an admin token can't mint a customer session) and redirects to `https://my.goodtunes.music/album/:id#token=<bearer>&gtwelcome=1`. The token rides in the URL **fragment** (fragments are never sent to the server, so the bearer never lands in an access log); `main.tsx` consumes it before React mounts (`setAuthToken`), scrubs the fragment from history, and leaves `?gtwelcome=1` to pop the one-time thank-you modal. `isPurchaseFunnelHost()` gates the cross-host hop, so in dev / single-host `*.replit.app` this stays an in-app navigation. Same mechanism the welcome-back sign-in link uses (`welcomeBack.ts`).

**OAuth must round-trip to the originating host.** The session cookie is host-only (`sameSite=none`, no `domain`), so OAuth state stored on the session would be dropped on a cross-subdomain callback. `callbackOrigin` therefore returns the *exact* customer-family host the fan started on (`store` vs. `my`) when building the provider `redirect_uri`, instead of always collapsing to the canonical customer host. **This means `https://store.goodtunes.music/api/auth/google/callback` and `…/apple/callback` must be registered as allowed redirect URIs with Google and Apple alongside the existing `my.goodtunes.music` ones** — without that IdP-console registration, Google/Apple sign-in from the store host will fail at the provider. Email-code sign-in and the `?buy=1` bounce-back stay same-origin and need no IdP change.

CNAMEs at the user's DNS provider point all three subdomains at the deployment. Apple's domain-association file is served at `/.well-known/apple-developer-domain-association.txt` on both hosts. Two ways to provide it: (1) commit the verification file Apple gives you to `public/.well-known/apple-developer-domain-association.txt` (preferred — survives redeploy, no secret-manager fiddling), or (2) set `APPLE_DOMAIN_ASSOCIATION` in the env. The route prefers the file when present and falls back to the env var.

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
