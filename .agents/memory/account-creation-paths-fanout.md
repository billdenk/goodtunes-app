---
name: Account-creation paths fan-out
description: Every per-account field stamped at sign-up must be written on all 5 separate account-creation code paths, or some accounts silently miss it.
---

# Account-creation paths fan-out

There are **five** distinct places a fan or partner account first comes into
existence. Any field you want stamped "at account creation" (Terms consent,
defaults, attribution, flags) must be written on **all five**, or whole cohorts
of accounts silently miss it.

The five paths (as of the Terms-consent work):
1. Customer signup-with-code — `server/commerce.ts` `/api/customer/signup-with-code` (updateCustomer after createCustomer).
2. Customer password register — `server/routes.ts` `/api/register` customer branch (updateCustomer).
3. OAuth first-time customer signup — `server/routes.ts` OAuth callback createCustomer branch.
4. OAuth invite-accept — `server/routes.ts`, **only** the FRESH-create branch (raw SQL); reused/existing rows must NOT be re-stamped.
5. Password invite-accept — `server/routes.ts`, folded into the is_admin UPDATE.

**Why:** `createCustomer`/`createUser` use *restricted* insert schemas (a
handful of fields only), so you cannot stamp arbitrary columns through the
create call — you stamp via a follow-up `updateCustomer`/`updateUser` or raw
SQL. That split is exactly why it's easy to cover 3 of 5 paths and think you're
done. OAuth and invite flows are the ones most often missed.

**How to apply:** when a task says "record X at sign-up", grep for every
create-account site (signup-with-code, /api/register, OAuth callback,
invite-accept password + OAuth) and confirm each one writes the field. Don't
re-stamp on invite-accept paths that reuse a pre-existing row.
