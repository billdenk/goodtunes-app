---
name: Check-then-act on unlinked create/delete pairs
description: When a delete gate reads sibling rows with no FK (custom template slots vs specs), serialize delete vs attach with a pg advisory lock.
---

The rule: any DELETE whose "is it safe?" check reads sibling rows that a concurrent create/attach path can mint (and there is no FK tying them) must serialize both critical sections and re-check AFTER acquiring the lock.

**Why:** press custom template slots and their spec rows are linked only by (format, slotKey) — no FK. A slot DELETE that checked "no revisions" then deleted could race a PUT attach validating "slot exists" then writing the spec: the fresh upload got deleted or orphaned. Completion code review rejects this pattern.

**How to apply:** per-entity `pg_advisory_lock(hashtextextended(key,0))` on a dedicated `pool.connect()` client (session-level, because the section spans several pooled storage calls; xact locks won't span), always unlock+release in finally; both the create/attach and delete routes take the same key; delete does slot+orphan-spec removal in one db.transaction. Deterministic test: grab the lock in the test, assert the DELETE is still pending after ~400ms, land the "upload" rows, unlock, expect 409. See server/pressTemplatesPortal.ts `withCustomSlotLock`.
