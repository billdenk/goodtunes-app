---
name: Phantom press homing cleanup (default_press_id + invited_by_press_id)
description: How a press's Customers list gets phantom members, and why un-homing must clear BOTH press-id columns, not just default_press_id.
---

# Phantom press "customers" and how to un-home them

A person/label shows up in a press portal's **Customers / People / Pipeline**
surfaces when its `default_press_id` points at that press (see
`sqlPressCustomers` in `server/pressPortal.ts`: `default_press_id = pressId` OR
they have a non-cancelled pressing order for it). A historical bulk stamp once
set `default_press_id` (and, for most, `invited_by_press_id`) = Memphis Record
Pressing (MRP) on ~129 famous artists/labels (Adele, Beyoncé, Springsteen…) who
have **zero** MRP pressing orders and MRP had **zero** invites — so they wrongly
listed as "ACCEPTED / 0 albums / 0 units". Prod-only; dev founding seed produces
0 homed rows, so no recurring code path recreates them.

## The non-obvious trap: `invited_by_press_id` is NOT passive provenance
It also drives **Sell-panel press/pricing resolution and admin album
attribution** (`server/commerce.ts` + admin album enrichment), often resolved
**before** `default_press_id`. So clearing only `default_press_id` fixes the
visible customer list but leaves **hidden press routing/pricing** behind. A
proper "these aren't that press's customers" cleanup must clear BOTH columns.

## Rule for any such cleanup
- Clear `default_press_id` **and** `invited_by_press_id` — but null
  `invited_by_press_id` ONLY where it equals the same press being cleared;
  preserve a *differently*-invited value (that's a separate relationship).
- Guard so real customers survive: skip rows that have a non-cancelled pressing
  order for that press OR any `admin_invites` tie (by `role_scope_id` or email).
- **Scope by stable manufacturer NAME**, never a hardcoded press id — dev↔prod
  press ids drift (see `press-roster-dev-prod-drift.md`). `name ILIKE
  '%Memphis Record Pressing%'` matches exactly one row in both DBs.
- Ship it marker-guarded in `scripts/post-merge.sh` (prod is read-only via
  tooling; post-merge is the only sanctioned prod write path). Marker-guard also
  protects a legit later "add artist under press" (which sets `default_press_id`
  before any invite/order exists) from being clobbered on a future merge.

**Why:** Bill reported MRP's customer list full of artists it never worked with;
the ask was "no default press homing for these." Clearing default alone would
have left MRP silently winning their pricing/attribution.
