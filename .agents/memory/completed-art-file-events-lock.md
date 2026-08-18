---
name: Completed-art file events + production lock
description: Audit trail + lock semantics for completed-art slots (artist Template Test page vs press panel)
---
- `completed_template_file_events` is APPEND-ONLY (uploaded/downloaded/unlocked); the production lock is DERIVED: latest downloaded-vs-unlocked per component (order by created_at DESC, id DESC — tie-breaker matters).
- Lock blocks ONLY the album's own artist/label from replacing (409 on the check route); operators and the press stay unblocked. Only a genuine press-member download locks — operator downloads never do. Press-only unlock endpoint exists; press-side UI control is a future Ruby handoff.
- Tracked download is an authed POST returning `{url, fileName}` (bare `<a href>` can't carry the bearer — same lesson as CSV exports); the press download-event insert is FAIL-CLOSED (no audit row → no file).
- The artist Template Test page (`/artist/albums/:id/art-test/:componentId`) renders INSIDE the artist portal shell via ArtistDashboard route detection (`embedded` prop) — rails must never disappear on drill-in.
- OPEN (awaiting Ruby): how the artist page treats press/operator-supplied slot files (it currently shows them as if the artist uploaded them — Bill flagged this). See docs/STATUS.md "Open question for Ruby".

**Why:** the pressed file must stay provable — an artist can never claim the press pressed the wrong file.
**How to apply:** any new surface reading/writing completed-art slots must thread the event trail + respect the derived lock; never make lock writes best-effort.
