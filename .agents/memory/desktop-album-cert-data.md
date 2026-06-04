---
name: Desktop album GoodDeed cert data
description: Why the desktop album page derives cert/ownership numbers from orders, not the album payload
---

The mobile album page (`client/src/pages/AlbumDetail.tsx`) builds its `album`
object by spreading `staticAlbum` (musicData demo catalog), so it carries
`ownedCertificates`, `purchases`, and `certificateNumber` — but those are DEMO
values, not real ownership.

The desktop page (`client/src/pages/AlbumDetailDesktop.tsx`) uses an API-only
`ApiAlbum` type that has NONE of those fields. So to offer GoodDeed actions
(View GoodDeed / View Provenance / Ownership / Download PDF) on desktop, you must
derive owned cert numbers from the shared `/api/orders` cache (same `OrderLite`
filter as `AlbumCard.tsx` / mobile): keep rows where `albumId` matches, not
refunded, and has a `cert` or `goodDeedNumber`.

**Why:** the desktop surface has real ownership truth only through orders; the
album row never returns cert numbers.

**How to apply:**
- `ownedNums` = order `goodDeedNumber`s; gate View GoodDeed/Provenance on
  `ownedNums.length > 0`, the PDF download on the resolved owning order.
- The shared sheets consume the `Album` type: cast the API album
  `as unknown as PlayerAlbum`. `ProvenanceSheet` renders a hardcoded demo
  ownership chain (only reads title/artwork/artist + the passed certNum).
  `OwnershipSheet` reads `album.ownedCertificates` + `album.purchases`, so stamp
  `ownedCertificates: ownedNums` onto the cast (purchases stay absent → prices
  show "—", acceptable; it only shows when owning >1).
- **Demo grants ≠ orders:** an admin-granted *temporary preview* album has no
  order, so `ownedNums` is empty and the cert would fall back to a misleading
  `#01`. The "[Demo]" state is NOT order-derived — it comes from the
  `/api/my-albums` row's `isPreview` flag (Task #909). Mirror mobile: query
  `/api/my-albums`, compute `isPreviewAlbum` for this id, pass
  `isPreview={isPreviewAlbum}` into `GoodDeedCertificate` (which swaps every
  serial, the share text, and the PNG filename to `[Demo]`). Only the cert swaps
  — both mobile and desktop intentionally leave `ProvenanceSheet` showing
  "Certificate #N" for demos.
