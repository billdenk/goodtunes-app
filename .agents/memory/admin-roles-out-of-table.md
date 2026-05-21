---
name: Admin role columns live outside the users pgTable
description: Why server/auth/roles.ts uses raw SQL for users.role/role_scope_id, and what to do if you add a new role.
---

# Admin role columns are not in the drizzle pgTable

`users.role` and `users.role_scope_id` exist in the live `users` table but are intentionally **not** declared in `shared/schema.ts`'s `users` pgTable. They were added via raw `ALTER TABLE` migrations.

## Why
Drizzle-kit push has, in this repo, mis-detected unrelated rename intents (e.g. payout_accounts) and stalled on interactive prompts when these columns were added to the pgTable. Keeping the columns out of the typed schema lets us run raw-SQL migrations without poking drizzle-kit.

## How to apply
- Read or write `role` / `role_scope_id` through `server/auth/roles.ts` (`getUserRole`, `setUserRole`, `requireRole`), which use `db.execute(sql\`…\`)`.
- Do not add them to the `users` pgTable in `shared/schema.ts` without first removing the dependency on the out-of-band ALTERs and verifying `npm run db:push` runs cleanly.
- The `requireRole` middleware MUST be chained after `requireAdmin` — it reads `req.session.userId`, which `requireAdmin` populates.
- `ADMIN_ROLES` (the enum-ish array) does live in `shared/schema.ts` near the `adminInvites` table; use that when validating role input.
