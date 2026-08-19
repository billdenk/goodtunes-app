---
name: Person avatars are square by construction
description: Why person photos persist square (center-cropped) and the aspect-square flex-item egg trap on avatar tiles
---

Rule 1 (CSS): an `aspect-square` box that is a flex item is NOT guaranteed square — min-height:auto lets a taller-than-wide child `<img>` stretch it into an egg. Avatar tiles must render the photo in an `absolute inset-0` layer inside the aspect box (see AdminPeople PersonCard). Fixed w/h containers (w-10 h-10 etc.) are safe.

Rule 2 (data): every people.photo_url write goes through `squarePersonPhotoUrl()` in server/routes.ts — it mirrors external https URLs into object storage (external-links mirror rule) and center-crops non-square images via `squareCropImage()` (server/imageProcessing.ts, sharp, EXIF-rotated, ≤1500px edge). Fail-open: keeps the original URL on fetch/decode error. Wired at person create/update routes, press person create, credits-import Spotify enrichment, and both Spotify photo-refresh sites.

**Why:** non-square photos (Spotify portraits, operator uploads) rendered as egg-shaped avatars on the People grid; the one-time backfill (scripts/backfill-square-person-photos.ts, marker `square_person_photos_v1` per DB) already squared existing rows in dev+prod.

**How to apply:** any NEW code path that writes people.photo_url must call `squarePersonPhotoUrl()` first; any new avatar tile using aspect-ratio boxes must absolutize the image layer. Hotlink-protected CDNs (tinifycdn) 403 all server fetches — treat as permanent skip, not retryable failure.
