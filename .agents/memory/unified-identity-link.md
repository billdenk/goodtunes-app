---
name: Unified identity link (users ↔ customer_users)
description: How the fan and admin rows are linked into one account, the no-lockout password rule, and the single write seam — read before touching any auth/login/reset/promote/OAuth path.
---

# Unified identity: LINK, not merge

One human = one account across the fan player and admin shell, implemented as a **link** between the two tables, never a physical merge.

- `users.customer_user_id` (nullable, **no DB FK** — app-enforced) points at the canonical `customer_users` row. A real relational FK is deliberately avoided: the publish dev→prod diff re-adds dropped FKs (same failure mode as `auth-tokens-fk-recurrence.md`). A **partial unique index** (`WHERE customer_user_id IS NOT NULL`) keeps it 1:1.
- The **fan (`customer_users`) row is the source of truth** for password + OAuth identities. Admin row carries a mirror.

**Why LINK over merge:** fan-side orders / library / `*_identities` never move, and the admin 2FA gate keeps firing on the `users` row unchanged.

## Single write seam — `server/auth/identityLink.ts`

Every cross-table auth write MUST go through it or the rows drift:
- `linkAdminToCustomer` — sets link only when null (never re-points), **fills** an empty fan password from admin (never overwrites a real one), mirrors OAuth identities **both ways**.
- `writeLinkedPassword({adminUserId|customerId, hashed})` — overwrites BOTH linked rows. Call from EVERY password write (admin reset, admin self-serve change, customer reset/set-password).
- `getAdminIdForCustomer` / `getCustomerIdForAdmin` / `mirrorCustomerIdentitiesToAdmin` / `mirrorAdminIdentitiesToCustomer`.

**Identity mirroring must be BIDIRECTIONAL and cover ONGOING mutations, not just link time.** The fan row is canonical, but a provider sub can be attached on *either* shell first. Convergence has to run on every identity write/remove, not only at first link:
- link time + one-time backfill: mirror customer→admin AND admin→customer.
- ongoing ATTACH (`mirrorIdentityToLinked`): after any single-shell `storage.linkIdentity` (OAuth link-from-profile, relay reattach) copy the new identity to the linked counterpart.
- ongoing DETACH (`unlinkIdentityEverywhere`): `DELETE /api/auth/identities/:id` must remove the matching `(provider, sub)` on the counterpart too — else a "removed" provider still signs you in via the other shell.

A one-way mirror, AND a seam that only fired at link time while routes still did direct per-shell `linkIdentity`/`unlinkIdentity`, were BOTH code-review rejections. The rule: never leave a `storage.linkIdentity`/`unlinkIdentity` call that doesn't fan out to the linked row.

**The fan-password fill must skip `!oauth-only:%`.** That placeholder is not a hash; copying it into the canonical `customer_users.password` corrupts the store and breaks forgot-password / password-compare. Only copy a real hashed password into an empty fan credential. (Both the helper and the post-merge fill carry this guard.)

`admin_identities`/`customer_identities` use column **`linked_at`**, NOT `created_at` — an old inline promote INSERT used `created_at` and silently failed in a try/catch. Unique is `(provider, provider_user_id)`, so mirroring skips a sub already attached elsewhere (never re-points).

## No-lockout password rule

Link only ever *fills* an empty side. So `POST /api/login` (admin) accepts `users.password` **OR** the linked fan's canonical password — a pre-existing admin whose two passwords still differ is never locked out. The first reset/change after that converges both via `writeLinkedPassword`. **Customer login is unchanged** (fan row is already canonical).

## Where links get formed — TRUSTED PATHS ONLY

Linking must only happen where email/identity ownership is proven, because the admin login fallback (below) accepts the linked fan password as a **first factor**. An unverified link = a way to seed an admin first-factor for an email you don't own.
- `/api/admin/customers/:id/promote` = ensure `users` row → `linkAdminToCustomer` → `setUserRole` (promote collapsed into "add a membership"; returns `linkedCustomerId`). Trusted: super_admin authenticated.
- Both invite-accept paths (password `POST /api/invites/:token/accept` + OAuth invite-accept) link to an existing fan by `invite.email`. Trusted: operator issued the invite to that address.
- OAuth admin callback: no `admin_identity` for the `sub` → resolve linked admin via `customer_identity` + mirror forward. Trusted: provider-verified. **Must run BEFORE the email-collision `?prompt=link` redirect** or Google (returns email) bounces a valid linked admin.
- One-time post-merge backfill: existing real dupes.

**DO NOT link on `/api/register`** (self-serve fan signup) — it does NOT prove ownership of a same-email admin row. This was caught in code review as a first-factor-bypass bug; the auto-link was removed.

**Always exclude `@privaterelay.appleid.com` + `@oauth.local` from email-based linking** — relay is keyed off provider `sub`, never email; placeholders aren't real shared addresses.

**Why the login fallback is then safe:** with register-linking removed, every link is trusted, so accepting the linked fan password as an admin first factor only ever happens for a human who legitimately owns both rows.

## One-time merge of existing dupes

`scripts/post-merge.sh`: additive column + partial unique index on **dev AND prod** (hand-applied, drizzle push unreliable on additive DDL), then a marker-guarded (`post_merge_data_backfills` → `task_1037_link_humans`) one-shot that links every unambiguous 1:1 `lower(email)` match (real emails only), fills empty fan creds, mirrors identities. This block **intentionally mutates prod** (that's the merge) — unlike the dev-only press-roster reconcile — and the marker makes it idempotent so later operator password changes aren't clobbered.

## Gotcha

`tsc --noEmit` on this repo emits ~hundreds of PRE-EXISTING ES5-target errors (TS1501 regex flags, TS2554, function-in-block); the project runs via `tsx` and never gates on tsc. Don't chase them — only check your own edited line ranges.
