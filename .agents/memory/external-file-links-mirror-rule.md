---
name: External file links must be mirrored, never referenced
description: Standing rule — any pasted external link (Dropbox etc.) that becomes a persisted file source must be downloaded into our object storage first.
---

Standing rule from the creator: "just like audio, we should always download those files so we have them." Any external https link a user pastes that would be persisted as a file source of truth (audio masters, videos, images, template PDFs — any surface) must be downloaded into our own object storage at save time; the DB stores only our storage path, never the external URL.

**Why:** template slots once stored raw Dropbox links; preview/measurement then permanently depended on those links (a zip link poisoned slots with a durable "not a PDF" failure, and even valid links can die). Self-heal/retry paths are worthless if the source bytes live on someone else's host.

**How to apply:**
- Enforce at EVERY write boundary that accepts a URL — portal AND admin routes, plus any legacy fetch-and-store endpoints (sweep for older fetch helpers when tightening the pattern; a forgotten one keeps the weak posture alive). Reject non-https schemes up front.
- A failed external fetch fails the whole save (422) — never fall back to persisting the raw URL — and a failed save must delete any objects it already uploaded (arm compensation before mirroring; multi-stage mirrors can orphan partial uploads).
- Authorization runs BEFORE any external fetch, including approval-divert paths: a caller lacking the relevant upload permission must not be able to trigger remote downloads or storage writes.
- Old rows saved before the rule still hold external links; they heal when re-attached, and a one-time sweep mirrors the fetchable ones. Unmirrorable share pages (ShareFile, Dropbox .zip) end as "needs re-upload" flags answered with 422, never 5xx.

**Provenance:** tracks keep the original link as OPERATOR-only provenance — strip it for fans AND for partner roles (every partner account passes a bare is-admin check, so gate disclosure on an explicit operator-role check).

**SSRF posture:** validate the DNS answer at CONNECTION time (guarded lookup on the socket), never pre-check-then-fetch — a rebinding host defeats any two-resolution flow; DNS failures map to the same honest 422. The non-public classifier must cover ALL special-purpose IPv4/IPv6 space (CGNAT, TEST-NET, fe80::/10, v4-embedded forms), and URL hostnames keep brackets on IPv6 literals ("[::1]") — strip them before IP-literal detection or bracketed private literals bypass the guard entirely.
