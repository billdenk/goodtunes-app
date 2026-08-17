---
name: External file links must be mirrored, never referenced
description: Standing rule — any pasted external link (Dropbox etc.) that becomes a persisted file source must be downloaded into our object storage first.
---

Standing rule (gogoods, Aug 15 2026): "just like audio, we should always download those files so we have them." Any external https link a user pastes that would be persisted as a file source of truth (press template PDFs, certification test files — and any future surface) must be downloaded into our own object storage at save time; the DB stores the `/objects/uploads/...` path, never the external URL.

**Why:** Memphis template slots stored raw Dropbox links; preview/measurement then permanently depended on those links (a zip link poisoned slots with a durable "not a PDF" failure, and even valid links can die). Self-heal/retry paths are worthless if the source bytes live on someone else's host.

**How to apply:**
- Helper: `mirrorExternalTemplatePdf` in `server/templateSpecs.ts` (SSRF-guarded scan+spool → streamed signed PUT → admin/public ACL; deletes its own object on late failure). `deleteMirroredTemplateObject` for caller-side compensation when the DB write that would reference the object fails.
- Enforce at EVERY write boundary that accepts a URL (portal + admin routes both had one — the reviewer caught the admin one), and reject `http://`/other schemes up front.
- Old rows saved before the rule still hold external links; they heal when re-attached.

**Legacy dead-link handling (Aug 2026):** rows persisted before the rule can still hold external URLs; a one-time sweep mirrors the fetchable ones. After that, ANY remaining external `template_file_url` means the file is unfetchable → download route answers 422 `{code:"template_link_dead"}` (never 5xx — 5xx pages ops on every open) and the Templates UI presents the slot as "Needs re-upload". ShareFile share pages and Dropbox .zip links are inherently unmirrorable (not direct PDFs) — those always end as re-upload flags, not sweep bugs.
