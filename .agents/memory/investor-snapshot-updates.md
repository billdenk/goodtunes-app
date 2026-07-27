---
name: Investor snapshot re-uploads
description: Updating the /investors deck — Bill's exports lack the noindex meta; re-inject on every swap
---
The `/investors` page streams `server/assets/investor-snapshot.html` from disk on every request (no-store), so swapping the file needs NO restart/rebuild in a running env — but prod only updates on publish.
**Rule:** Bill's externally-built "standalone" HTML exports do NOT contain `<meta name="robots" content="noindex, nofollow">` — every re-upload must re-inject it right after `<meta charset="utf-8">` before copying over the served file.
**Why:** the page is public-by-URL for investors only; header (X-Robots-Tag) + baked-in meta are the intended double shield, and robots.txt deliberately stays Allow (blocking fetch would let a linked URL still index).
**How to apply:** cp upload → server/assets/investor-snapshot.html, sed-insert the meta, verify `grep -c noindex` = 1 and served bytes == file via curl+cmp.
