---
name: OAuth duplicate-account recovery
description: Why legacy fans who sign in with Apple/Google after an app update see an empty library, and how to consolidate them (admin "Combine accounts" tool now shipped).
---

# OAuth duplicate-account recovery (empty library after re-auth)

## Symptom
A longtime fan reports "no collection / no artists" after a forced app update.
Almost always: they have TWO fan accounts — their original (real email; often a
legacy gogoods import) that owns their library, and a brand-new EMPTY one created
when they tapped "Sign in with Apple" (or Google) at the re-auth prompt. Apple
hands us a private-relay email, so it doesn't match the existing account.

## Why it happens (by design, not a bug)
OAuth signup deliberately does NOT auto-merge into an existing account that shares
the captured real email — that's a takeover guard. The real email is stored on the
new row as `contact_email`; the `email` field is the private-relay address. So you
must diagnose by searching fan accounts on BOTH `email` AND `contact_email`.

## The hard constraint that decides the survivor
The merge reparents the fan's **content** (albums, orders, playlists) loser→survivor
and soft-deletes the loser, but it does **NOT** move OAuth identities
(`customer_identities`). **Therefore the surviving account MUST be the OAuth (Apple/
Google) one** — otherwise the next social sign-in resolves to the soft-deleted loser
and the fan is locked out ("Account merged, sign in with your other email"). In the
classic case that means survivor = the new empty Apple account, loser = the original
library-holder.

**Why:** this invariant is the whole reason the recovery is non-obvious — the
intuitive "keep the account with the library" is backwards.

## What's available (state as of 2026-06)
- **Admin "Combine accounts" tool — SHIPPED.** A super-admin can fold one fan
  account into another from the customer profile: search candidates, preview exactly
  what moves, and confirm. The tool **recommends the OAuth holder as survivor**
  (honoring the invariant above), warns + requires an explicit ack when the absorbed
  account would lose a working sign-in, and hard-blocks absorbing an account that's
  linked to an admin login (would orphan the admin's customer link). Reuses the same
  transactional merge as the fan path (triggeredBy "admin") and is reversible via the
  merge-history undo + audit on the same page.
  - Open question never confirmed with Bill: the lost-sign-in ack only fires when the
    loser holds OAuth identities; a *password-only* loser merges with no warning even
    though its email/password sign-in also dies (the operator does see a Password
    chip). Deliberate for now.
- **Operator sign-in link — also available** (no eligibility gate, super_admin only,
  on the customer detail page). Good for an immediate, no-merge fix.
- The fan-facing self-serve merge panel stays **hidden** (Bill: "adds noise").

## The fixes
1. **Immediate (no merge):** generate a sign-in link on the fan's ORIGINAL account,
   send it to their real email → they land back in the account that owns the library.
   Leaves the duplicate; they hit it again next time they tap Apple sign-in.
2. **Durable:** use the admin Combine-accounts tool — survivor = the Apple/Google
   account, loser = the original — so future social sign-ins map to the real library.
   Note prod DB is read-only to the agent, so the operator runs this in the live app.

**How to apply:** diagnose first (search both email columns, confirm which row owns
the library), then pick fix #1 for speed or #2 for permanence.
