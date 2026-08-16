---
name: Prod edge 413s large request bodies
description: Deployment edge rejects big uploads (413) before they reach Express — dev has no cap; route large files via signed-PUT to object storage.
---
The production deployment edge (Google front-end) rejects large HTTP request bodies with an HTML `413 Request Entity Too Large` **before the request ever reaches the app** — nothing appears in prod logs. A 59 MB body was rejected; dev (`localhost` / replit.dev proxy) has no such cap, so the same upload works in development.

**Why:** the art-inspect live check silently showed "inspection unavailable" on prod for a 59 MB CMYK jacket JPEG while measuring fine in dev — no server log line existed because the POST was killed at the edge.

**How to apply:** any endpoint accepting raw file bodies must route files above ~20 MB through the signed-PUT direct-to-GCS flow (`POST /api/admin/upload-doc/sign` → browser PUT to the signed URL → post just the `/objects/uploads/...` path). Skip `finalize` when the object should stay private (server reads the private dir via `getObjectEntityFile` regardless). When debugging "prod-only upload failure with no server logs", curl the prod host with a big body and look for the HTML 413.
