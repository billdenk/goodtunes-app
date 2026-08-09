---
name: Press hidden-album detail scope
description: Why a press-assigned prepping/hidden album can list but 404 on detail, and how includeHidden resolves press assignment
---

Press (manufacturer) partners are scoped by press ASSIGNMENT (non-cancelled pressing_order_requests `package_snapshot->>'pressId'` OR `album_skus.press_id`), NOT artist/label ownership. The shared partner catalog filter (`filterAlbumsForPartnerRole`) fails closed on the manufacturer role, so any hidden/prepping visibility check built on it will 404 a press's own album.

**Why:** the press Projects list (`/api/press/:id/albums`) is assignment-scoped and visibility-agnostic, while `GET /api/albums/:id` gated hidden access through the artist/label filter — press saw the card but "Album not found" on click (super_admin bypasses, so operators never notice).

**How to apply:** `albumReadIncludeHidden` in server/routes.ts now has a manufacturer branch running the assignment SQL (SKU branch also mirrors the list's eligibility: `is_goodtunes_release=true AND is_spin_promo=false`). Any new album read gated per-partner must treat manufacturer as assignment-scoped, not ownership-scoped. Note: getUserRole is view-as aware, so super-admin view-as-press exercises the manufacturer path, not god view.
