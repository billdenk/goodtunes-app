---
name: Operator super-admin fan-out notify guard
description: All listSuperAdminEmails()-driven notification loops must route through notifySuperAdmins()
---

# Operator fan-out notify guard

Any route that fans a single event out to EVERY super-admin via
`listSuperAdminEmails()` MUST send through `notifySuperAdmins()` in
`server/mail.ts`, never a bare `for (email of superEmails) sendXxx()` loop.

**Why:** the album-delete db test suite drove the real DELETE route, whose fan-out
emailed every super-admin — pulling in Bill's REAL address on every test run
(a flood). The pre-existing synthetic-RECIPIENT guard didn't catch it: the
recipient (Bill) is real, it's the REQUESTER that's synthetic. So the class
of bug is "test/dev requester → real operator inbox".

**How to apply:** `notifySuperAdmins({ template, recipients, requesterEmail,
dedupeKey, send })` gates: (1) skip unless NODE_ENV==="production"; (2) skip
when `isSyntheticRecipient(requesterEmail)` even in prod; (3) dedupe identical
`dedupeKey` within 10 min + per-recipient cap of 12 of one template/hour.
Returns `{attempted, sent, skippedReason}`; best-effort, never throws. Pass a
`dedupeKey` like `<template>:<requesterId>:<subjectId>`. If the caller needs an
honest "was it delivered?" reply (custom-addon change request), derive it from
`outcome.sent > 0`, not a per-send bool. State is in-memory per-instance.

Current call sites (server/routes.ts): album-delete-request,
album-change-request, rig-quote-request, custom-addon-change-request.
