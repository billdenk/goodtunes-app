---
name: Seed-album auto-grant signature (retired)
description: How to identify the historical createUser seed-album auto-grant rows in user_albums after it was removed.
---

# Seed-album auto-grant signature

The old `createUser` auto-grant (removed Task #1189) stamped every new account
with the four standard demos (`album-1`..`album-4`) — and, because the loop ran
over the WHOLE `albums` table, every other catalog album that existed at signup.

To identify the leftover STANDARD auto-grant rows in `user_albums`:
- `album_id IN ('album-1','album-2','album-3','album-4')`
- `is_preview = false` (active demos are separate)
- `certificate_number IN (12,7,3,21)` — the four seed cert numbers
- NO backing paid/shipped `orders` row for that `user_id`+`album_id`

**Why cert-IN, not exact (album-1→12) pairing:** the grant mapped certs by
array index over `SELECT * FROM albums`, and that ordering drifted, so in real
data each standard album carries a MIX of the four seed certs (e.g. album-2 had
3/7/12/21). Exact pairing misses most rows; cert-IN catches them all.

**Why this is safe vs comps/purchases:** both comps (admin "Grant") and paid
purchases insert `user_albums` with a NULL `certificate_number` (the GoodDeed
number lives on the `orders` row, not `user_albums`). So a non-null seed cert
uniquely marks an auto-grant; the paid-order guard is belt-and-suspenders.

`user_albums.user_id` is the loose FK holding the fan/customer id — match orders
via `orders.customer_id = user_albums.user_id`.
