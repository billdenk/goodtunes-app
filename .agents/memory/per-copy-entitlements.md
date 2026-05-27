---
name: Per-copy order entitlements
description: How multi-quantity checkout splits an order into per-copy entitlements with their own GoodDeed numbers, and the invariants that keep numbers monotonic and refund-safe.
---

Multi-quantity album checkouts split into one `order_copies` row per physical copy. The order row keeps a legacy `goodDeedNumber` (mirror of the first signed copy's number) so downstream readers — admin lists, fulfillment, OrderDesk metadata, certificate printer — don't have to learn about copies.

**Rule:** any code minting or reading GoodDeed numbers on an album MUST include `order_copies.good_deed_number` in its MAX/floor calculation. Just looking at `orders.good_deed_number` and `user_albums.certificate_number` will silently re-mint a number that's already been printed on a per-copy certificate.

**Why:** the legacy single-row-per-order shape is preserved for back-compat, so `orders.good_deed_number` is the FIRST signed copy's number — the other K-1 numbers live only on `order_copies`. The floor calc must SELECT GREATEST over all three sources or numbering collisions return on the next sale.

**How to apply:**
- Number assignment lives in `assignNextGoodDeedNumber(albumId)` — that function is the single source of truth and already covers all three tables. Don't bypass it.
- The partial unique index `order_copies_album_good_deed_number_uniq` on `(album_id, good_deed_number) WHERE good_deed_number IS NOT NULL` catches cross-order races; wrap multi-copy inserts in `withRetryOnGoodDeedCollision`.
- Refunds MUST null every `order_copies.good_deed_number` for the order, not just `orders.good_deed_number`, so the floor monotonically advances past the freed slots (we never reuse, but a refunded number must stop appearing on certificates).
- Stock decrement on materialise + restore on refund both scale by the order_items quantity (N), not by 1.

**Certificate fan-out:** `ensureCertificateForOrder` mints one `signed_cert_certificates` row per signed `order_copies` entry with `copy_id` set; legacy single-copy orders (no `order_copies` rows yet) fall back to one row per order with `copy_id NULL`. The two partial unique indexes on the cert table (`order_legacy_uniq` for NULL copy_id, `order_copy_uniq` for NOT NULL) keep both shapes idempotent without conflicting.
