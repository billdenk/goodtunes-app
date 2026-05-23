---
name: Partner permissions + post-sale lock
description: How per-scope partner permission flags, the pending-changes review queue, and the post-sale album lock interact in the admin surface.
---

## The rule
Every admin endpoint that mutates partner-owned data must answer two
orthogonal questions before doing the work:

1. **Does this partner's scope have the right verb on?** Five verbs
   live on `partner_permissions`: `edit_metadata`, `upload_masters`,
   `map_shopify`, `manage_payouts`, `invite_subusers`. Missing → 403.
2. **Is the album locked after first sale?** Only the
   record-as-sold verbs respect the lock — currently `edit_metadata`
   and `upload_masters`. Shopify mapping and payouts intentionally
   stay editable post-sale (you still need to re-price or fix a
   payout split on a sold album).

`metadataEditsRequireApproval` is a soft mode on top of (1)+(2): when
the verb passes and the album isn't locked, the edit is *diverted* to
the pending-changes queue instead of applied. Lock + no override =
hard 403 with `{locked: true}`, never a divert.

**Why:** mixing "needs approval" with "post-sale locked" into the
same divert path led to two reject loops in code review — partners
would silently queue edits against locked albums and assume they'd
publish. A 403 with `locked: true` is the only correct shape for the
lock case.

## Coverage rule
"Metadata" includes **credits and artist/label bios**, not just the
album/song row itself. Any new mutation route touching:
- album or song fields
- track writers / performers
- person (artist) profile fields — bio, photo, links
- label profile fields — bio, logo, links
…must run the verb+lock check too. Easy to miss because the table
isn't `albums` or `songs`.

## Queue apply rule
The review endpoint must only stamp a pending-change row as
`approved` **after** the replayed patch actually mutates the target
row. If apply returns falsy (or throws) the queue row must stay
`pending`, otherwise the audit trail lies. The route surfaces this as
a distinct error so reviewers know to adjust and retry rather than
treating it like "already reviewed."

## Approve-with-edits
The review endpoint accepts an optional patch override that replaces
the partner's submission *and* overwrites the queue row's stored
patch so the audit trail reflects what was actually applied, not
what was submitted.

## UI affordance
Don't speculatively POST and parse the 403. There's a dedicated
edit-access read endpoint that returns
`{canEdit, locked, hasActiveOverride, requiresApproval, missingPermissions}`
for an album. Fetch it before disabling inputs or showing inline
"Read-only / Locked / Edits go to GoodTunes" hints. Cache key is
`["/api/admin/albums", albumId, "edit-access"]` so the page header
chip and individual panels share the same query result.

## Gotchas
- `getUserRole` lives in the auth/roles module, not in
  partnerPermissions. Easy to mis-import.
- `ownerKind` on payout accounts is `"person" | "label"` but the
  partner-scope kind is `"artist" | "label"`. Translate `person →
  artist` when calling the scope-only verb check.
- Override consumption is single-shot by default and happens inside
  the gate. The UI-affordance read must peek without consuming so
  that fetching it doesn't burn the partner's one allowed edit.
- Sub-user invites: partners with `invite_subusers` are allowed
  through, but role and scope on the new user must be force-pinned
  to the inviter's own. Never trust the role/scope fields in the
  invite body for partner callers.

## Override consumption is per-request, not per-gate
A locked-album mutation can pass through more than one verb gate in
one request (song save = edit_metadata + upload_masters when audio is
attached; credit save = edit_metadata + later upload checks). If each
gate consumes its own override row, a single user save burns two
single-shot overrides and the second gate 403s immediately after a
super-admin unlock.

**Rule:** the override consumer must memoize on the request (e.g. a
`Set<albumId>` hung off `req`). The first gate consumes; subsequent
gates in the same request see the memo and pass without re-consuming.
**Why:** super-admin unlock is meant to re-open partner edits for one
*save*, not one *gate check* — a single save commonly touches both
metadata and master in one round trip.
