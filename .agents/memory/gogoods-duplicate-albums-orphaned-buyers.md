---
name: gogoods duplicate albums strand buyers
description: Deleted gogoods-import duplicate albums leave buyers' ownership + cert on a dead row; how to reconnect safely.
---

# gogoods duplicate albums strand orphaned buyers

The old gogoods import created near-duplicate album rows (same artist, slightly
different title). When the operator soft-deleted the empty/duplicate copy, the
fans who had bought/been-granted it were left owning a `deleted_at` album — their
`user_albums` entitlement + GoodDeed cert + completed `orders` all stranded on a
dead row.

**To reconnect, carry the buyer onto the live content-complete album:**
- Copy the certificate onto the live `user_albums` row (`COALESCE` so an existing
  live cert wins), prefer the original `acquired_at`, keep "owned" if either row
  is owned (`is_preview = l.is_preview AND d.is_preview`), then delete the dead
  row. If the buyer has no live row, just `UPDATE album_id` (carries cert + id).
- Repoint `orders` via `UPDATE album_id`.

**Why the GDN guard is mandatory:** gogoods double-imported some orders, so the
SAME buyer can hold two orders with the SAME `good_deed_number` across the dup +
live album (e.g. billdenk@mac.com on Big Mouth Barry). Repointing blindly
violates the partial unique `(album_id, good_deed_number)`. Guard every order
repoint with `... AND (good_deed_number IS NULL OR NOT EXISTS (live order with
same gdn))` and leave the colliding duplicate on the dead row.

**How to apply:** one-off data rectification → marker-guarded block in
`scripts/post-merge.sh` (data resets aren't naturally idempotent). Run the
"remove unbacked free grants" step (cert-less + never-bought signature) FIRST,
while the dead rows still exist, or the signature stops being meaningful after
consolidation deletes them. These deleted dupes carried no `order_copies` /
`signed_cert_certificates` / `referral_credits` — verify that before assuming
only `user_albums` + `orders` need moving. Always end with a report-only sweep
for OTHER soft-deleted albums that still have order-backed buyers.
