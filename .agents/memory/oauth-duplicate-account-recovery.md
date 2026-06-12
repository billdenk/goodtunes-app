---
name: OAuth duplicate-account recovery
description: Why legacy fans who sign in with Apple/Google after an app update see an empty library, and the only working fixes given the hidden merge panel.
---

# OAuth duplicate-account recovery (empty library after re-auth)

## Symptom
A longtime fan reports "no collection / no artists" after a forced app update.
Almost always: they have TWO `customer_users` rows — their original account
(real email; often a legacy gogoods import with `legacy_gogoods_id`) that owns
their library, and a brand-new EMPTY account created when they tapped
"Sign in with Apple" (or Google) at the re-auth prompt. Apple hands us a
private-relay email, so it doesn't match the existing account.

## Why it happens (by design, not a bug)
OAuth signup deliberately does NOT auto-merge into an existing account that
shares the captured real email — that's a takeover guard (see the
"Don't auto-merge" comment in `server/routes.ts`). The real email is stored on
the new row as `contact_email`; `email` is the private relay address.

## What the merge flow does — and its hard constraint
`server/welcomeBack.ts` merge (`/api/me/welcome-back/merge/*`) reparents
**user_albums, orders, playlists** losing→surviving, soft-deletes the loser
(`merged_into_id`), revokes its tokens, writes a `customer_merges` audit row.
**It does NOT move `customer_identities` (OAuth links).**
**Therefore the surviving account MUST be the OAuth (Apple) one** — otherwise
the next Apple sign-in resolves to the soft-deleted loser and `requireAuth`
returns "Account merged, sign in with your other email" (Apple sign-in breaks).

## What's available vs not (state as of 2026-06)
- The fan "These two accounts are me" panel (`AccountMergePanel`) is **commented
  out / hidden** in `client/src/pages/Account.tsx` (Bill: "adds noise"). So the
  fan canNOT self-serve the merge in-app.
- There is **no admin force-merge endpoint** — only admin **undo**
  (`/api/admin/customers/:survivingId/merges/:mergeId/undo`) + an audit list.
- Operator **sign-in link** DOES exist and has NO eligibility gate:
  `POST /api/admin/customers/:id/signin-link` (super_admin only), surfaced on
  AdminCustomerDetail. Legacy accounts are typically passwordless (magic-link).

## The fixes
1. **Immediate (no code, operator):** open the fan's ORIGINAL account in admin,
   "Generate sign-in link", send it to their real email → they land back in the
   account that owns their library. Leaves the duplicate; they'll hit it again
   if they tap Apple sign-in next time.
2. **Durable:** consolidate so Apple sign-in maps to the real library. Given the
   constraints above, that's a merge with **survivor = the Apple account**,
   loser = the original. No prod write is possible from the agent (prod DB is
   read-only) and the fan panel is hidden, so this needs either re-enabling the
   fan panel or (better) a new admin "combine accounts" action (triggeredBy
   "admin") reusing the merge transaction. Confirm with Bill before building.

**How to apply:** First diagnose by searching `customer_users` on BOTH `email`
AND `contact_email` (the real email lives in `contact_email` on the OAuth row).
Confirm which row owns `user_albums`/`orders`. Then pick fix #1 for speed, #2
for permanence.
