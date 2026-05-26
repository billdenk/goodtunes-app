# Welcome-back migration (gogoods.com → GoodTunes)

The legacy gogoods.com importer (Task #398) backfilled ~2,939
`customer_users` rows with `legacy_gogoods_id` stamped (the prior
gogoods.com customer id) but no password and no OAuth identity. Of
those, ~1,850 also carry `email_verified_at` (we trust gogoods.com's
verification record) and ~211 are Apple private-relay addresses
imported from the legacy "Sign in with Apple" flow.

This doc covers the **welcome-back flow** (Task #400) — how those fans
get back into the new GoodTunes player without re-creating an account.

## Counts at a glance

| group                                     | rows  | what we do                                                 |
| ----------------------------------------- | ----- | ---------------------------------------------------------- |
| Imported total                            | 2,939 | `customer_users.legacy_gogoods_id IS NOT NULL`             |
| Verified — eligible for wave-1 mail       | ~1,850 | wave-1 email-link sign-in (this doc)                       |
| Pending (email never verified on gogoods) | ~1,088 | excluded; must do a normal customer signup                 |
| Apple private-relay subset                | ~211  | reattach-on-relay path in OAuth callback                   |

## Flow

```
                      ┌─────────────────────┐
                      │ admin: send wave-1  │
                      │  /admin/welcome-    │
                      │       back          │
                      └──────────┬──────────┘
                                 │ POST /api/admin/welcome-back/send
                                 │ (kill switch + batches of 25, 1s sleep)
                                 ▼
                ┌─────────────────────────────┐
                │ sendWelcomeBackEmail(...)   │
                │ stamp welcome_email_sent_at │
                │ row in welcome_back_email_  │
                │  sends (sent | failed)      │
                └──────────────┬──────────────┘
                               │ link contains a 30-day single-use token
                               ▼
              GET /api/welcome-back/redeem/:token
                               │ mint customer session
                               ▼
                /welcome-back  (3 screens, gated on
                               needsOnboarding from
                               /api/me/welcome-back/state)
                               │ stamp onboarded_at
                               ▼
                          /collection  ✅
```

## Schema (lives in `shared/schema.ts`; mirrored in `scripts/post-merge.sh`)

`customer_users` adds:

- `onboarded_at` — stamped when the 3-screen onboarding finishes.
  Once set, `/welcome-back` redirects away on every future visit.
- `welcome_email_sent_at` — single-shot guard. The admin /send route
  only mails rows where this is NULL, so retrying is safe.
- `merged_into_id` — soft-delete pointer for fan-initiated merges.
  `/api/me` returns 401 when this is set, so a stale token can't
  transact against the dead row.

New tables:

- `welcome_back_tokens` — 30-day single-use sign-in tokens (token
  hashed at rest with SHA-256). Also re-used for the merge-confirm
  flow (24-hour TTL there; same shape, different consumer).
- `welcome_back_email_sends` — one row per *attempt* (sent / failed)
  so an operator can reconcile against Resend deliverability and
  retry only the failed addresses.
- `customer_merges` — audit row per fan-initiated merge. Surfaces on
  the admin customer detail page so the operator can see what moved
  and from where.

## Apple private-relay reattach

Apple's "Hide my email" returns a forwarder unique per (fan, app), so
the relay address Apple gives us on first sign-in is *stable* across
sessions for the same fan. The legacy gogoods.com importer wrote each
fan's stable relay as the email on the imported row.

On a fresh "Sign in with Apple" callback (`server/routes.ts`
~ line 796), when:

- the OAuth identity lookup misses (this is the first time the
  GoodTunes side sees this Apple sub), **and**
- the email Apple gave us is `@privaterelay.appleid.com`, **and**
- an existing `customer_users` row carries that exact relay as its
  email **and** has `legacy_gogoods_id` set

we *link* the new Apple identity onto the imported row instead of
creating a fresh OAuth account. The fan keeps their orders + owned
albums; the relay address never changes.

The non-relay path (real address) still goes through the
account-collision prompt (`?prompt=link`) so we don't silently merge a
different fan into someone else's row.

## Self-service entry

The fan-facing entry point for a fan who didn't get (or lost) the
wave-1 mail is `POST /api/welcome-back/start` — same input shape as
`/api/auth/lookup`, same constant-floor latency, same
no-enumeration semantics. The login page banner ("Imported from
gogoods.com?") posts here when the fan taps "Email me a sign-in
link". On a hit we mint a fresh token and email the same template the
admin wave uses.

## Merge ("these two accounts are me")

A fan who created a new GoodTunes account *before* the importer ran
ends up with two rows — the new one (which they're signed in on) and
the imported one (with all their old orders). Their profile shows a
"These two accounts are me?" affordance: enter the other email →
we email a 24-hour confirmation link to that address → clicking it
runs `POST /api/me/welcome-back/merge/confirm` which:

1. moves `user_albums` from losing → surviving (loose FK on
   `user_albums.user_id`, see `.agents/memory/user-albums-loose-fk.md`)
2. moves `orders` from losing → surviving
3. moves `playlists` from losing → surviving
4. stamps `merged_into_id` on the losing row
5. deletes every outstanding `auth_tokens` row for the losing customer
6. inserts a `customer_merges` audit row

Admin sees the audit list on the surviving customer's detail page
under "Account merges" — counts of what moved, the losing email, and
when it happened.

## Operations

| toggle / surface                            | purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `WELCOME_BACK_KILL_SWITCH=on` env var       | hard-stop the admin /send endpoint                   |
| `/admin/welcome-back` (super-admin only)    | audience snapshot + dry run + live send + counters   |
| `welcome_back_email_sends` table            | per-recipient log; query by `status = 'failed'` to retry |
| `customer_users.welcome_email_sent_at`      | single-shot guard — retries skip already-mailed rows |
| `customer_merges` table                     | audit of every fan-initiated merge                   |
