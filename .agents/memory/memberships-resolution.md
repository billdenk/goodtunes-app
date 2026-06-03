---
name: Membership-backed role resolution
description: How account role/scope resolution reads from the memberships SET with a synth-from-legacy fallback, and the dual-write contract that keeps legacy columns authoritative.
---

# Membership-backed role resolution (unified identity P1)

`getUserRole` resolves an account's primary hat from the `memberships` SET
(`getUserMemberships` → `pickPrimaryMembership`), and partner gates match scope
via `findMembershipForScope`, NOT the single `users.role_scope_id`. This is the
new indirection layer all role/scope reads flow through.

**Why:** one account needs to hold many scopes (a fan login that is also an
artist on a label and a teammate elsewhere) without per-caller rewrites. Routing
ALL reads through `getUserRole`/`findMembershipForScope` means callers stay
unchanged and behavior is byte-for-byte identical for single-membership users.

**How to apply / gotchas:**
- The `memberships` table is **additive + dual-written** — `users.role` /
  `role_scope_id` / `partner_permissions` / `partner_permission_overrides`
  remain the source of truth that ships. Never drop or stop writing them.
- **Synth fallback:** when the table is absent (fresh dev clone before
  post-merge) or an account has no rows, resolution synthesizes ONE membership
  from the legacy columns. So dev/tests run the synth path and read identically
  to prod. The DB path only activates after `scripts/post-merge.sh` creates the
  table + runs the marker-guarded backfill (`task_1036_memberships`).
- **Keep all three paths consistent:** original `getUserRole`, the synth
  fallback, and the SQL backfill must agree. Role normalization (`org`→
  `non_profit`, unknown→`super_admin`) and `role_scope_id` (preserved verbatim,
  even for god roles) must be reproduced EXACTLY in the post-merge SQL or the DB
  read path silently diverges from synth.
- **Verb GRANTs do NOT move:** gates still read `partner_permissions` /
  `partner_permission_overrides`. `memberships.permission_overrides` is a
  dual-written MIRROR of the per-(scope,user) overrides only (consumed by the
  P3 hat-switcher). Scope-wide `partner_permissions` is deliberately NOT
  mirrored per-membership (would invite drift) — `upsertPartnerPermissions`
  writes no membership.
- Every legacy write must keep the SET in lock-step: `setUserRole` →
  `syncUserMembership`; founder bootstrap re-syncs Bill; override writers
  (team-override PUT/DELETE, invite-accept grants) → `rebuildMembershipOverrides`.
- Two PARTIAL unique indexes guard it: one god membership per account
  (`WHERE scope_id IS NULL`), one per `(user_id, scope_kind, scope_id)`
  (`WHERE scope_id IS NOT NULL`).
