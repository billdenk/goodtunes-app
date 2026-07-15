---
name: Grant numbers (GR sequence) on user_albums
description: Comped copies carry user_albums.grant_number ("GR NN"), a separate per-album sequence from paid certificate_number; never mix the two or default a missing number to 1.
---
Granted (comped, non-paid) copies get `user_albums.grant_number`, rendered "GR NN"; paid copies keep `certificate_number` ("#NN"). Rules:

- **Never mix sequences**: the paid-number floor takes MAX over `certificate_number`, so GR numbers must stay in their own column.
- **No `?? 1` fallbacks**: a row with no number shows NOTHING. The old fallback made every unnumbered grantee display "#01" (the bug that started this).
- Mint via `assignNextGrantNumber` (server/commerce.ts) + `withRetryOnGrantNumberCollision`; `album_grant_counters` keeps the sequence monotonic after a revoke deletes the max row (self-heals via GREATEST against live MAX).
- Two partial unique indexes on user_albums: (album_id, certificate_number) and (album_id, grant_number), each WHERE NOT NULL — created in post-merge AFTER the task_52 dedup backfill.
- Cert Share button (`/share/cert`) is paid/preview-only — its num param is digits-only, GR copies can't share that route.
**Why:** Bill's call — grants should be numbered but visibly distinct so paid GoodDeed serials stay exclusive to paid copies.
**How to apply:** any new surface showing a copy's serial must branch paid `#NN` / grant `GR NN` / preview `[Demo]` / none; any new grant-creation path must mint GR with the retry wrapper.
