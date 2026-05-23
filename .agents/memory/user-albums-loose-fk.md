---
name: user_albums.user_id loose FK
description: user_albums.user_id holds customer_users.id in practice despite schema FK to users.id — same drift as auth_tokens.
---

`shared/schema.ts` declares `user_albums.user_id` with `.references(() => users.id)`, but the runtime row carries `customer_users.id` (the fan's ID), not the admin `users.id`. The Postgres FK is not enforced in dev or prod — it has never been created from the schema definition.

**Why:** GoodTunes has two parallel user tables (admin `users` + fan `customer_users`). The collection / purchase flow always writes the customer ID. The schema was never tightened because the FK has remained inert. Same loose-FK pattern as `auth_tokens.user_id`, which keeps coming back from `drizzle-kit push` and has to be dropped (see [migration-claims-vs-reality.md](migration-claims-vs-reality.md) and the auth_tokens cleanup task).

**How to apply:**
- When inserting into `user_albums` from an admin tool acting on a fan (e.g. demo grant-album), pass the `customer_users.id`, not a `users.id`. `onConflictDoNothing()` on the unique `(user_id, album_id)` index keeps it idempotent.
- Never query `user_albums` joined to `users` — join `customer_users` instead.
- If a future `db:push` ever materializes the FK, drop it (same recipe as auth_tokens) rather than rewriting the writers.
