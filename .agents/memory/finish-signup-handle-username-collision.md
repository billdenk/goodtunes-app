---
name: Finish-signup handle vs legacy username collision
description: Why picking a fan @handle can pass the availability check then 500 on save
---

The post-OAuth "One last thing" screen (FinishSetup → POST /api/auth/complete-signup) mirrors `username = handle` on write to keep legacy surfaces (playlist URLs, welcome-back, admin search) working. `customer_users.username` is `.notNull().unique()` (global, case-sensitive) AND there's a newer partial unique index on `lower(handle)`.

**The trap:** legacy gogoods-imported fans got a `username` auto-derived from their email local-part (e.g. an email whose local-part is "gogoods" → username "gogoods") but NEVER a `handle`. So the handle-availability check — which historically queried ONLY the `handle` column — reports the name free, then the mirrored `username` write collides on `customer_users_username_unique` → raw 500.

**Rule:** any handle availability/classify check MUST test BOTH `lower(handle)` AND `lower(username)` (self-excluded), because the write enforces uniqueness on both.

**Why the 500 wasn't caught friendly:** drizzle wraps the driver error — the real Postgres SQLSTATE is on `err.cause.code`, not `err.code` (same unwrap lesson as cached-plan). The catch also only matched the handle index name, not `customer_users_username_unique`. Match both constraint names + read code off `err.cause` to return a 409.

**How to apply:** when adding/altering any fan handle picker or save path, keep classify (live check) and the write's uniqueness footprint in lockstep. If a fan legitimately wants a name a legacy account squats only as `username` (never claimed as a handle), freeing it is a prod data decision for the operator (Bill), not an automatic reassignment.
