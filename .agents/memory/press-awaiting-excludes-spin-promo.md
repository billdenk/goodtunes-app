---
name: Press awaiting-pressing queues must exclude SPIN Promos
description: Why every press "awaiting/pre-pressing via SKU" query must filter is_spin_promo, and the four lockstep sites.
---

Every query that surfaces albums for a press via a stamped SKU (`album_skus.press_id = <press>` + `is_goodtunes_release = true` + no pending/approved pressing order) MUST also add `AND a.is_spin_promo = false`.

**Why:** A SPIN Promo (`albums.is_spin_promo = true`) is a digital-only legacy release. The admin album page HIDES all manufacturing surfaces for it (Path-to-press strip, Package/Physical/Shopify tabs). So it can never receive a pressing order — without the filter it strands permanently as "Awaiting pressing order" in both the operator Albums tab and the partner press portal, with no operator affordance to clear it. Bill hit exactly this: MRP's list showed digital-only promos as forever-awaiting.

**How to apply:**
- Four lockstep sites, all SKU-scoped: operator `GET /api/admin/manufacturers/:id/albums` awaiting-union (server/routes.ts), and three in server/pressPortal.ts — `sqlPressSummaryCounts` `pre_pressing` CTE, the pre-pressing-with-units list, and `/api/press/:id/albums` `scoped_sku` CTE.
- Filter ONLY the SKU branch, NEVER the `pressing_order_requests` branch — an album with a real order must still surface even if later flagged spin-promo. (Flagging/unflagging then instantly removes/restores it from the queue.)
- Do NOT touch analytics/branding/resolution SKU-press sites (partnerDashboard pressUnits/pressAlbumIds sales rollups, routes.ts skuPressMap press-branding placeholder, earlyCut tier resolution, pressPortal person-scoped catalog list) — those aren't awaiting queues.

**Operator "how do I unassign" answer:** flip the SPIN Promo toggle on the album's admin Overview (auto-removes from every press queue), OR clear/delete the format's press in the Package (Sell) tab, OR change the invited/default press at the artist/label level (album resolves press by walking album→artist→label). There is no one-click "clear press_id" button on a SKU that keeps the SKU.
